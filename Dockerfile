# Dockerfile para el frontend
# Etapa 1: Compilación de la aplicación Angular con SSR
FROM node:20.11.1 as build

WORKDIR /app

# Copia solo los archivos necesarios para npm install
COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Etapa 2: Configuración de Node.js para SSR
FROM node:20.11.1

WORKDIR /app
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package*.json ./

RUN npm install

# Exponer el puerto 4201
EXPOSE 4201

CMD ["npm", "run", "server:ssr"]

#envsubst < /usr/share/nginx/html/assets/env.template.js > /usr/share/nginx/html/assets/env.js &&
