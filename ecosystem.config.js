module.exports = {
  apps : [{
    name   : "med-bot",
    script : "./index.js",
    env: {
      TZ: "Asia/Tokyo",
      NODE_ENV: "production"
    }
  }]
}
