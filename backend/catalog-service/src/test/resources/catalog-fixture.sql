CREATE ALIAS IF NOT EXISTS JSON_CONTAINS FOR "com.smart_cafe_ai.catalog_service.JsonFunctions.contains";
INSERT INTO Categories (id,name,image,sort_order,status) VALUES
 (1,'Coffee',NULL,1,'Active'), (2,'Tea',NULL,2,'Active'), (3,'Hidden',NULL,0,'Inactive'), (4,'Empty',NULL,3,'Active');
INSERT INTO Products (id,category_id,name,description,temperature,caffeine_level,flavor_tags,sort_order,status) VALUES
 (1,1,'Latte','Milk coffee','Hot_Or_Iced','Medium',JSON '["creamy","sweet"]',1,'Active'),
 (2,1,'Americano','Black coffee','Iced','High',JSON '["bitter"]',2,'Active'),
 (3,2,'Matcha','Green tea','Blended','Low',JSON '["creamy"]',1,'Active'),
 (4,1,'Retired','Hidden product','Hot','High',NULL,0,'Inactive'),
 (5,3,'Hidden category product',NULL,NULL,'None',NULL,0,'Active'),
 (6,2,'No variants',NULL,NULL,'None',NULL,3,'Active'),
 (7,2,'Only inactive variants',NULL,NULL,'None',JSON '["sweet"]',4,'Active');
INSERT INTO Product_Variants (id,product_id,variant_name,price,sort_order,status) VALUES
 (11,1,'M',40000,1,'Active'), (12,1,'L',50000,2,'Active'), (13,1,'Old',1000,0,'Inactive'),
 (21,2,'Standard',30000,1,'Active'), (31,3,'Standard',60000,1,'Active'),
 (41,4,'Standard',1,1,'Active'), (51,5,'Standard',1,1,'Active'), (71,7,'Old',500,1,'Inactive');
INSERT INTO Product_Option_Groups (id,product_id,name,selection_type,is_required,min_select,max_select,sort_order) VALUES
 (101,1,'Sugar','Single',TRUE,1,1,1), (102,1,'Toppings','Multiple',FALSE,0,2,2);
INSERT INTO Product_Options (id,group_id,option_name,extra_price,is_default,sort_order,status) VALUES
 (1001,101,'Normal',0,TRUE,1,'Active'), (1002,101,'Less sugar',0,FALSE,2,'Active'),
 (1003,102,'Pearls',5000,FALSE,1,'Active'), (1004,102,'Retired topping',1,FALSE,0,'Inactive');
INSERT INTO Branch_Product_Availability (id,branch_id,variant_id,is_available,unavailable_reason) VALUES
 (1,10,11,FALSE,'Size M sold out'), (2,10,12,TRUE,NULL),
 (3,20,11,FALSE,'No milk'), (4,20,12,FALSE,'No milk'),
 (5,20,13,TRUE,NULL), (6,10,21,FALSE,'Sold out');
INSERT INTO Branch_Option_Availability (id,branch_id,option_id,is_available,unavailable_reason) VALUES
 (1,10,1003,FALSE,'No pearls'), (2,20,1001,FALSE,'No sugar');

