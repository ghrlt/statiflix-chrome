DATE=$(date +"%Y-%m-%d")
zip -r archive-$DATE.zip . -x "*.zip" ".git/*" ".git*"
