module.exports = {
  apps: [
    {
      name: "hotel-backend",
      script: "./api/server.js", 
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M', // ปรับขึ้นสำหรับ Pi 4 ให้ทำงานได้เต็มประสิทธิภาพ
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
