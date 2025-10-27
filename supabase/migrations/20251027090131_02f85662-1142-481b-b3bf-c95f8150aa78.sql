-- Clean up news with corrupted data
DELETE FROM news WHERE title LIKE '%[object%' OR excerpt LIKE '%[object%';