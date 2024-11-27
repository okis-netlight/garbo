FROM ghcr.io/${GITHUB_REPOSITORY}-base:main

COPY package*.json /app/
COPY prisma /app/
WORKDIR /app
RUN npm install --omit=dev
RUN npx prisma generate

COPY . /app
CMD ["npm", "start"]
