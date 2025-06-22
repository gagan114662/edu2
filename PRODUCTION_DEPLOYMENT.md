# 🚀 AI Tutor Production Deployment Guide

## 📋 Prerequisites

### Server Requirements
- **Ubuntu 20.04+ server** with root/sudo access
- **Domain**: `dazl.ai` pointing to your server's IP
- **SSL Certificate**: Let's Encrypt (automated in scripts)
- **Minimum specs**: 2 CPU cores, 4GB RAM, 20GB storage

### Required Services
- **Nginx** (web server & reverse proxy)
- **PostgreSQL** (database)
- **Node.js 18+** (frontend build)
- **Python 3.8+** (backend)
- **Certbot** (SSL certificates)

## 🔥 Firebase Configuration

### 1. **Update Firebase Console Settings**

#### Authorization Settings:
```
Console: https://console.firebase.google.com/project/dazl-40524

✅ Authentication → Sign-in method → Google:
   - Status: ENABLED
   - Authorized domains: localhost, dazl.ai, www.dazl.ai

✅ Project Settings → General:
   - Support email: your-email@domain.com (REQUIRED!)

✅ OAuth consent screen:
   - Authorized domains: dazl.ai
   - Application homepage: https://dazl.ai
   - Privacy policy: https://dazl.ai/privacy (create if needed)
```

#### Download Admin Credentials:
```bash
# Go to: Settings → Service accounts → Generate new private key
# Download: firebase-admin-credentials.json
```

## 🌐 DNS Configuration

Point your domain to the server:
```
A     dazl.ai           → YOUR_SERVER_IP
A     www.dazl.ai       → YOUR_SERVER_IP  
A     api.dazl.ai       → YOUR_SERVER_IP
```

## 🛠️ Server Setup

### 1. **Install Dependencies**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y nginx postgresql postgresql-contrib nodejs npm python3-pip python3-venv git

# Install Node.js 18 (if needed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. **Setup PostgreSQL**
```bash
sudo -u postgres psql

# In PostgreSQL:
CREATE DATABASE dazl_db;
CREATE USER dazl_user WITH ENCRYPTED PASSWORD 'junkisbanned114';
GRANT ALL PRIVILEGES ON DATABASE dazl_db TO dazl_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO dazl_user;
ALTER USER dazl_user CREATEDB;
\q
```

### 3. **Deploy Application**
```bash
# Upload your code to server
cd /opt
sudo git clone YOUR_REPO_URL ai-tutor
cd ai-tutor

# Or upload manually:
# scp -r /local/path/edu2 user@server:/opt/ai-tutor

# Run deployment script
sudo ./deploy.sh
```

### 4. **Setup SSL**
```bash
# Run SSL setup script
sudo ./setup-ssl.sh

# Manually if needed:
sudo certbot --nginx -d dazl.ai -d www.dazl.ai -d api.dazl.ai
```

### 5. **Upload Firebase Credentials**
```bash
# Upload firebase admin credentials
scp firebase-admin-credentials.json user@server:/opt/ai-tutor-backend/

# Set permissions
sudo chown www-data:www-data /opt/ai-tutor-backend/firebase-admin-credentials.json
sudo chmod 600 /opt/ai-tutor-backend/firebase-admin-credentials.json
```

## 🚀 Production Configuration

### Environment Variables

**Frontend (.env.production):**
```bash
REACT_APP_FIREBASE_API_KEY=AIzaSyDfrntb2-uku66rjmbYcS7ksRu6NelvIIU
REACT_APP_FIREBASE_AUTH_DOMAIN=dazl-40524.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=dazl-40524
REACT_APP_FIREBASE_STORAGE_BUCKET=dazl-40524.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=519971584022
REACT_APP_FIREBASE_APP_ID=1:519971584022:web:5c5b915968c119ea9d1d37
REACT_APP_FIREBASE_MEASUREMENT_ID=G-4JG6J16L8V

REACT_APP_BACKEND_WS_URL=wss://api.dazl.ai/ws/voice_tutor
REACT_APP_API_BASE_URL=https://api.dazl.ai
```

**Backend (.env.production):**
```bash
DATABASE_URL=postgresql://dazl_user:junkisbanned114@localhost:5432/dazl_db
FIREBASE_ADMIN_SDK_CREDENTIALS_PATH=./firebase-admin-credentials.json
GEMINI_API_KEY=AIzaSyAZFQzr1YcGBgmt2CVnECoM_-JALCg5uZw
FRONTEND_URL=https://dazl.ai
USE_SSL=true
PORT=8000
```

## 🔍 Service Management

### Start/Stop Services
```bash
# Backend API
sudo systemctl start ai-tutor-backend
sudo systemctl stop ai-tutor-backend
sudo systemctl restart ai-tutor-backend

# Check status
sudo systemctl status ai-tutor-backend

# View logs
sudo journalctl -u ai-tutor-backend -f
```

### Nginx Management
```bash
# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx
```

## 🧪 Testing Production Deployment

### 1. **Health Checks**
```bash
# API health check
curl https://api.dazl.ai/

# Frontend check
curl https://dazl.ai

# SSL check
curl -I https://dazl.ai
```

### 2. **Login Flow Test**
1. Go to `https://dazl.ai`
2. Click "Sign in with Google"
3. Should redirect to Google OAuth
4. After authentication, should return to dashboard

### 3. **API Test**
```bash
# Test protected endpoint (should get 401)
curl https://api.dazl.ai/api/users/me

# Test public endpoint
curl https://api.dazl.ai/docs
```

## 🛡️ Security Checklist

- ✅ **SSL/TLS**: HTTPS enabled for all domains
- ✅ **Firewall**: Only ports 22, 80, 443 open
- ✅ **Database**: PostgreSQL not exposed externally
- ✅ **Secrets**: Firebase credentials with restricted permissions
- ✅ **CORS**: Properly configured for dazl.ai only
- ✅ **Headers**: Security headers in Nginx config

## 📊 Monitoring

### Log Files
```bash
# Backend logs
sudo journalctl -u ai-tutor-backend -f

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs  
sudo tail -f /var/log/nginx/error.log

# SSL certificate expiry
sudo certbot certificates
```

### Performance Monitoring
```bash
# System resources
htop

# Disk usage
df -h

# Database connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

## 🔄 Updates & Maintenance

### Deploy Updates
```bash
cd /opt/ai-tutor
git pull origin main
sudo ./deploy.sh
```

### SSL Renewal
```bash
# Auto-renewal is setup, but you can test:
sudo certbot renew --dry-run
```

### Database Backups
```bash
# Create backup
sudo -u postgres pg_dump dazl_db > backup_$(date +%Y%m%d).sql

# Restore backup
sudo -u postgres psql dazl_db < backup_file.sql
```

## 🆘 Troubleshooting

### Common Issues

**503 Service Unavailable:**
```bash
sudo systemctl status ai-tutor-backend
sudo journalctl -u ai-tutor-backend -n 50
```

**SSL Certificate Issues:**
```bash
sudo certbot certificates
sudo certbot renew
```

**Database Connection Issues:**
```bash
sudo -u postgres psql -c "SELECT version();"
sudo systemctl status postgresql
```

**Firebase Auth Issues:**
- Check Firebase Console authorized domains
- Verify support email is set
- Check OAuth consent screen

## 📞 Support

- **Logs Location**: `/var/log/` and `journalctl`
- **Config Files**: `/etc/nginx/sites-available/dazl.ai`
- **Service Files**: `/etc/systemd/system/ai-tutor-backend.service`

---

Your AI Tutor platform should now be live at **https://dazl.ai** with full SSL and OAuth authentication! 🎉