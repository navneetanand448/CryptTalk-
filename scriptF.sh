npm run build
sudo rm -rf /var/www/vite-app
sudo mkdir -p /var/www/vite-app
sudo cp -r dist/* /var/www/vite-app/
sudo chown -R www-data:www-data /var/www/vite-app
sudo chmod -R 755 /var/www/vite-app
sudo systemctl reload nginx
