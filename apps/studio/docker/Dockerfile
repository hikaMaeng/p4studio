FROM node:24-alpine
WORKDIR /app
COPY dist ./dist
EXPOSE 43120
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.P4STUDIO_PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.cjs"]
