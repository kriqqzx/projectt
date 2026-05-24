DROP DATABASE IF EXISTS project;
CREATE DATABASE project;
\c project;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    login VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100) UNIQUE,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    payment VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Новая',
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

\echo 'База данных project создана'