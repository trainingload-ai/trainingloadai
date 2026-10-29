-- Public defaults formerly supplied by the mixed Cloud seed command.
INSERT INTO "t_enum" ("id","created_at","updated_at","category","value","label","description","sort_order","is_active") VALUES
('core_enum_distance_unit_meters',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'DISTANCE_UNIT','meters','Meters (m)','Distance in meters',1,true),
('core_enum_distance_unit_kilometers',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'DISTANCE_UNIT','kilometers','Kilometers (km)','Distance in kilometers',2,true),
('core_enum_distance_unit_miles',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'DISTANCE_UNIT','miles','Miles (mi)','Distance in miles',3,true),
('core_enum_speed_unit_kmh',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'SPEED_UNIT','kmh','Kilometers per hour (km/h)','Speed in kilometers per hour',1,true),
('core_enum_speed_unit_mph',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'SPEED_UNIT','mph','Miles per hour (mph)','Speed in miles per hour',2,true),
('core_enum_speed_unit_ms',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'SPEED_UNIT','ms','Meters per second (m/s)','Speed in meters per second',3,true),
('core_enum_theme_light',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'THEME','light','Light','Light theme',1,true),
('core_enum_theme_dark',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'THEME','dark','Dark','Dark theme',2,true),
('core_enum_theme_system',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'THEME','system','System','Follow system theme',3,true)
ON CONFLICT ("category","value") DO NOTHING;
