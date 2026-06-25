# Use current Alpine Node image
FROM node:24-alpine

# Set the working directory to the project folder
WORKDIR /app

# Copy package files separately for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy all files from the project folder
COPY . .

# Expose the Vite dev server port
EXPOSE 5174

# Default start command for Admin Hub
CMD ["npm", "run", "dev", "--", "--host"]
