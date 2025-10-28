-- Clean up all existing server status entries
DELETE FROM server_status;

-- Also clean up related news entries about server status
DELETE FROM news WHERE category = 'Server Status';