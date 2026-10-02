package com.smart_cafe_ai.identity_service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@SpringBootApplication
public class IdentityServiceApplication {

	public static void main(String[] args) {
		loadDotEnv();
		SpringApplication.run(IdentityServiceApplication.class, args);
	}

	private static void loadDotEnv() {
		Path current = Paths.get("").toAbsolutePath();
		while (current != null) {
			Path envFile = current.resolve(".env");
			if (Files.exists(envFile)) {
				try {
					List<String> lines = Files.readAllLines(envFile);
					for (String line : lines) {
						line = line.trim();
						if (!line.isEmpty() && !line.startsWith("#") && line.contains("=")) {
							int eqIdx = line.indexOf('=');
							String key = line.substring(0, eqIdx).trim();
							String val = line.substring(eqIdx + 1).trim();
							// Strip quotes if present
							if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
								val = val.substring(1, val.length() - 1);
							}
							if (System.getProperty(key) == null && System.getenv(key) == null) {
								System.setProperty(key, val);
							}
						}
					}
					System.out.println("Nạp thành công file .env : " + envFile);
					break;
				} catch (Exception e) {
					System.err.println("Không thể nạp .env từ " + envFile + ": " + e.getMessage());
				}
			}
			current = current.getParent();
		}
	}

}
