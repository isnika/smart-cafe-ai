"""Run after `mvn test`: exercise category admin APIs against a disposable MySQL DB.

Uses the datasource credentials from the environment/application.yaml. Creates a
unique smart_cafe_catalog_test_* database, starts an isolated JVM on a free local
port, and removes only that test database in finally. Requires CREATE/DROP DATABASE
permissions. MYSQL_CLIENT can point to mysql.exe when it is not on PATH.
"""
from pathlib import Path
from urllib.parse import urlsplit, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time
import unicodedata
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
MODULE = ROOT / "backend/catalog-service"
CONFIG = (MODULE / "src/main/resources/application.yaml").read_text(encoding="utf-8")


def setting(key):
    match = re.search(r"\$\{" + key + r":([^}]*)\}", CONFIG)
    return os.environ.get(key, match.group(1) if match else "")


def main():
    client = os.environ.get("MYSQL_CLIENT") or shutil.which("mysql")
    if not client:
        candidates = sorted(Path("C:/Program Files/MySQL").glob("*/bin/mysql.exe"))
        if candidates:
            client = str(candidates[-1])
    if not client:
        raise RuntimeError("Set MYSQL_CLIENT to the MySQL client executable")
    report = MODULE / "target/surefire-reports/TEST-com.smart_cafe_ai.catalog_service.CatalogApiTest.xml"
    cp = ET.parse(report).getroot().find("properties/property[@name='java.class.path']").get("value")
    cp = os.pathsep.join(p for p in cp.split(os.pathsep) if "test-classes" not in p)
    source = urlsplit(setting("SPRING_DATASOURCE_URL").removeprefix("jdbc:"))
    database = "smart_cafe_catalog_test_" + uuid.uuid4().hex[:12]
    assert re.fullmatch(r"smart_cafe_catalog_test_[0-9a-f]{12}", database)
    sql_env = os.environ.copy()
    sql_env["MYSQL_PWD"] = setting("SPRING_DATASOURCE_PASSWORD")
    args = [client, "--protocol=TCP", "--connect-timeout=5", "--default-character-set=utf8mb4",
            "--host=" + str(source.hostname), "--port=" + str(source.port or 3306),
            "--user=" + setting("SPRING_DATASOURCE_USERNAME"), "--batch", "--skip-column-names"]

    def sql(statement):
        result = subprocess.run(args, input=statement.encode("utf-8"), env=sql_env,
                                capture_output=True, check=False)
        if result.returncode:
            raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))
        return result.stdout.decode("utf-8").strip()

    key = os.urandom(48)

    def token(role):
        def b64(value):
            return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
        head = b64(b'{"alg":"HS256","typ":"JWT"}')
        body = b64(json.dumps({"sub": "smoke-manager", "role": role,
                               "exp": int(time.time()) + 600}).encode())
        message = head + "." + body
        return "Bearer " + message + "." + b64(hmac.new(key, message.encode(), hashlib.sha256).digest())

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}/catalog"
    manager = token("Manager")
    checks = []

    def request(method, path, body=None, expected=200, authorization=manager):
        headers = {"Accept": "application/json"}
        if authorization:
            headers["Authorization"] = authorization
        payload = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        try:
            with urlopen(Request(base + path, data=payload, headers=headers, method=method), timeout=15) as response:
                status, data = response.status, json.load(response)
        except HTTPError as error:
            status, data = error.code, json.load(error)
        assert status == expected, (method, path, status, data)
        checks.append((method, path, status))
        return data

    process = None
    created = False
    log_path = MODULE / "target/category-admin-mysql.log"
    try:
        sql(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        created = True
        schema = (ROOT / "database/catalog/schema.sql").read_text(encoding="utf-8")
        sql(schema.replace("smart_cafe_catalog_db", database))
        env = os.environ.copy()
        env.update({"SPRING_DATASOURCE_URL": f"jdbc:mysql://{source.hostname}:{source.port or 3306}/{database}?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true",
                    "SPRING_DATASOURCE_USERNAME": setting("SPRING_DATASOURCE_USERNAME"),
                    "SPRING_DATASOURCE_PASSWORD": setting("SPRING_DATASOURCE_PASSWORD"),
                    "JWT_SECRET": base64.b64encode(key).decode(), "DEBUG": "false"})
        with log_path.open("w", encoding="utf-8") as log:
            process = subprocess.Popen([shutil.which("java") or "java", "-cp", cp,
                "com.smart_cafe_ai.catalog_service.CatalogServiceApplication",
                f"--server.port={port}", "--server.address=127.0.0.1", "--eureka.client.enabled=false",
                "--spring.jpa.hibernate.ddl-auto=validate", "--spring.profiles.active=mysql-smoke",
                "--debug=false", "--logging.level.root=WARN", "--spring.jpa.show-sql=false"],
                cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            for attempt in range(180):
                if process.poll() is not None:
                    raise RuntimeError("Catalog failed to start; see " + str(log_path))
                try:
                    with urlopen(f"http://127.0.0.1:{port}/actuator/health", timeout=1) as health:
                        if health.status == 200:
                            break
                except (URLError, TimeoutError):
                    time.sleep(0.5)
            else:
                raise RuntimeError("Catalog startup timed out; see " + str(log_path))

            initial = request("GET", "/admin/categories")
            assert initial["data"] == [] and initial["meta"]["total"] == 0
            request("POST", "/categories", {}, 401, None)
            request("POST", "/categories", {"name": "Denied"}, 403, token("Customer"))
            category = request("POST", "/categories", {"name": "  Cà\u00a0phê   demo  ", "sort_order": 3}, 201)["data"]
            category_id = category["id"]
            assert category["name"] == "Cà phê demo"
            request("POST", "/categories", {"name": "CA PHE DEMO"}, 409)
            request("PUT", f"/categories/{category_id}", {"name": "Cà phê demo mới", "sort_order": 4, "status": "Active"})
            assert request("GET", "/admin/categories?q=" + urlencode({"q": "CÀ PHÊ"}).split("=", 1)[1])["meta"]["total"] == 1
            defaults = request("POST", "/categories", {"name": "Defaults"}, 201)["data"]
            request("POST", "/categories", {"name": "100% Arabica"}, 201)
            assert request("GET", "/admin/categories?q=%25")["meta"]["total"] == 1
            page = request("GET", "/admin/categories?page=2&size=1")
            assert page["meta"]["total"] == 3 and len(page["data"]) == 1

            for term in ["ca phe", "CÀ PHÊ", unicodedata.normalize("NFD", "Cà phê")]:
                found = request("GET", "/admin/categories?" + urlencode({"q": term}))["data"]
                assert [row["id"] for row in found] == [category_id]
            drink = request("POST", "/categories", {"name": "Đồ uống", "status": "Inactive"}, 201)["data"]
            # Also exercise decomposed text imported directly from SQL, outside the write API.
            decomposed = unicodedata.normalize("NFD", "Đồ uống").replace("'", "''")
            sql(f"USE `{database}`; UPDATE Categories SET name='{decomposed}' WHERE id={drink['id']};")
            for term in ["do uong", "ĐỒ UỐNG", "Đồ uống"]:
                found = request("GET", "/admin/categories?" + urlencode({"q": term, "status": "Inactive"}))["data"]
                assert [row["id"] for row in found] == [drink["id"]]
            empty = request("GET", "/admin/categories?" + urlencode({"q": "Defaults"}))["data"][0]
            assert empty["total_product_count"] == 0 and empty["active_product_count"] == 0
            ids = request("GET", "/admin/categories?sort=id,desc")["data"]
            assert [row["id"] for row in ids] == sorted([row["id"] for row in ids], reverse=True)
            tied_page = request("GET", "/admin/categories?sort=sort_order,desc&page=2&size=1")["data"]
            assert [row["id"] for row in tied_page] == [defaults["id"]]
            for sort in ["unknown", "name,up", "name,asc,id", "name;drop table Categories", "total_product_count"]:
                request("GET", "/admin/categories?" + urlencode({"sort": sort}), expected=400)
            request("GET", "/admin/categories?size=101", expected=400)

            sql(f"USE `{database}`; INSERT INTO Products(category_id,name,status,caffeine_level) VALUES ({category_id},'Visible','Active','None'),({category_id},'Retired','Inactive','None');")
            sql(f"USE `{database}`; INSERT INTO Product_Variants(product_id,variant_name,price,sort_order,status) SELECT id,'M',10000,1,'Active' FROM Products WHERE category_id={category_id} AND name='Visible'; INSERT INTO Product_Variants(product_id,variant_name,price,sort_order,status) SELECT id,'L',15000,2,'Active' FROM Products WHERE category_id={category_id} AND name='Visible';")
            counts = request("GET", "/admin/categories?" + urlencode({"q": "ca phe"}))["data"][0]
            assert counts["total_product_count"] == 2
            assert counts["active_product_count"] == counts["product_count"] == 1
            assert len(request("GET", f"/products?category_id={category_id}")["data"]) == 1
            for _ in range(2):
                request("PATCH", f"/categories/{category_id}/status", {"status": "Inactive"})
            assert request("GET", f"/products?category_id={category_id}")["data"] == []
            inactive_counts = request("GET", "/admin/categories?" + urlencode({"q": "ca phe", "status": "Inactive"}))["data"][0]
            assert inactive_counts["total_product_count"] == 2 and inactive_counts["active_product_count"] == 1
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Audit_Logs WHERE entity_id='{category_id}' AND action='CATEGORY_STATUS_CHANGED';") == "1"
            request("POST", "/categories", {"name": "CA PHE DEMO MOI"}, 409)
            request("PATCH", f"/categories/{category_id}/status", {"status": "Active"})
            assert len(request("GET", f"/products?category_id={category_id}")["data"]) == 1
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Products WHERE status='Inactive';") == "1"
            assert sql(f"USE `{database}`; SELECT JSON_TYPE(new_value) FROM Audit_Logs WHERE entity_id='{category_id}' ORDER BY id LIMIT 1;") == "OBJECT"
            assert sql(f"USE `{database}`; SELECT actor_user_id FROM Audit_Logs ORDER BY id LIMIT 1;") == "smoke-manager"

            for body in [{"name": 123}, {"name": "Bad", "sort_order": 1.5},
                         {"name": "Bad", "status": 0}, {"name": "Bad", "image": "javascript:alert(1)"}]:
                request("POST", "/categories", body, 400)
            request("PATCH", "/categories/999999/status", {"status": "Inactive"}, 404)
            request("GET", "/admin/categories?page=0", expected=400)

            def race(name):
                try:
                    return request("POST", "/categories", {"name": name}, 201)
                except AssertionError as error:
                    assert error.args[0][2] == 409, error
                    return None

            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes = list(pool.map(race, ["Concurrent category", "CONCURRENT CATEGORY"]))
            assert sum(result is not None for result in outcomes) == 1
            winner = next(result for result in outcomes if result)["data"]["id"]
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(lambda _: request("PATCH", f"/categories/{winner}/status", {"status": "Inactive"}), range(2)))
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Audit_Logs WHERE entity_id='{winner}' AND action='CATEGORY_STATUS_CHANGED';") == "1"

            request("DELETE", f"/categories/{defaults['id']}", expected=401, authorization=None)
            request("DELETE", f"/categories/{defaults['id']}", expected=403, authorization=token("Customer"))
            request("DELETE", "/categories/0", expected=400)
            request("DELETE", "/categories/999999", expected=404)
            blocked = request("DELETE", f"/categories/{category_id}", expected=409)
            assert blocked["error"]["code"] == "CATEGORY_IN_USE" and "Inactive" in blocked["error"]["message"]
            inactive_only = request("POST", "/categories", {"name": "Delete blocked"}, 201)["data"]["id"]
            sql(f"USE `{database}`; INSERT INTO Products(category_id,name,status,caffeine_level) VALUES ({inactive_only},'Retired only','Inactive','None');")
            blocked = request("DELETE", f"/categories/{inactive_only}", expected=409)
            assert blocked["error"]["code"] == "CATEGORY_IN_USE"
            assert sql(f"USE `{database}`; SELECT status FROM Categories WHERE id={inactive_only};") == "Active"

            deleted = request("DELETE", f"/categories/{defaults['id']}")
            assert deleted["data"]["id"] == defaults["id"] and deleted["message"] == "Xóa danh mục thành công."
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Categories WHERE id={defaults['id']};") == "0"
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Audit_Logs WHERE entity_id='{defaults['id']}';") == "2"
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Audit_Logs WHERE entity_id='{defaults['id']}' AND action='CATEGORY_DELETED' AND old_value IS NOT NULL AND new_value IS NULL;") == "1"
            request("DELETE", f"/categories/{defaults['id']}", expected=404)
            request("DELETE", f"/categories/{drink['id']}", authorization=token("Admin"))
            recreated = request("POST", "/categories", {"name": "Defaults"}, 201)["data"]
            assert recreated["id"] != defaults["id"]

            delete_race = request("POST", "/categories", {"name": "Concurrent delete"}, 201)["data"]["id"]

            def delete_once(category_id):
                try:
                    request("DELETE", f"/categories/{category_id}")
                    return 200
                except AssertionError as error:
                    assert error.args[0][2] == 404, error
                    return 404

            with ThreadPoolExecutor(max_workers=2) as pool:
                deleted_codes = list(pool.map(delete_once, [delete_race, delete_race]))
            assert sorted(deleted_codes) == [200, 404]
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Audit_Logs WHERE entity_id='{delete_race}' AND action='CATEGORY_DELETED';") == "1"

            insert_race = request("POST", "/categories", {"name": "Insert delete race"}, 201)["data"]["id"]
            start = threading.Barrier(2)

            def delete_with_insert():
                start.wait(timeout=10)
                try:
                    request("DELETE", f"/categories/{insert_race}")
                    return 200
                except AssertionError as error:
                    assert error.args[0][2] == 409, error
                    return 409

            def insert_with_delete():
                start.wait(timeout=10)
                statement = f"USE `{database}`; INSERT INTO Products(category_id,name,status,caffeine_level) VALUES ({insert_race},'Concurrent insert','Active','None');"
                result = subprocess.run(args, input=statement.encode("utf-8"), env=sql_env, capture_output=True)
                if result.returncode:
                    assert re.search(r"ERROR (1452|1213|1205)\b", result.stderr.decode("utf-8", errors="replace")), result.stderr
                return result.returncode == 0

            with ThreadPoolExecutor(max_workers=2) as pool:
                delete_future = pool.submit(delete_with_insert)
                insert_future = pool.submit(insert_with_delete)
                delete_code = delete_future.result(timeout=25)
                inserted = insert_future.result(timeout=25)
            remaining = sql(f"USE `{database}`; SELECT COUNT(*) FROM Categories WHERE id={insert_race};")
            if delete_code == 200:
                assert remaining == "0" and not inserted
            else:
                assert remaining == "1"
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Products p LEFT JOIN Categories c ON c.id=p.category_id WHERE c.id IS NULL;") == "0"
            assert sql(f"USE `{database}`; SELECT COUNT(*) FROM Audit_Logs WHERE entity_id='{insert_race}' AND action='CATEGORY_DELETED';") == ("1" if delete_code == 200 else "0")
            print(f"PASS: {len(checks)} HTTP checks plus MySQL collation, original schema validation, audit JSON and concurrency", flush=True)
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if created:
            sql(f"DROP DATABASE `{database}`;")
            print("Removed disposable database " + database, flush=True)


if __name__ == "__main__":
    main()
