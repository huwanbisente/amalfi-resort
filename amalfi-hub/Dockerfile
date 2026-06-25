# Use current Alpine Node image
FROM node:24-alpine

# Set the working directory to the project folder
WORKDIR /app

# Copy package files separately for better caching
COPY package.json package-lock.json* ./

# Install dependencies from the lockfile
RUN npm ci

# Copy all files from the project folder
COPY . .

# Expose the API port
EXPOSE 3001

CMD ["node", "server.js"]
