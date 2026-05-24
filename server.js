const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Подключение к SQLite
const db = new sqlite3.Database('./database.db');

// Создание таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT UNIQUE,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        course TEXT NOT NULL,
        date TEXT NOT NULL,
        payment TEXT NOT NULL,
        status TEXT DEFAULT 'Новая',
        review TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
});

// ===== АВТОМАТИЧЕСКОЕ СОЗДАНИЕ АДМИНА =====
db.get('SELECT * FROM users WHERE login = ?', ['Admin'], async (err, user) => {
    if (err) {
        console.log('Ошибка проверки админа:', err);
        return;
    }
    
    if (!user) {
        const hashedPassword = await bcrypt.hash('KorokNET', 10);
        db.run(`INSERT INTO users (login, password, name, phone, email, role) 
                VALUES (?, ?, ?, ?, ?, ?)`,
            ['Admin', hashedPassword, 'Администратор', '8(000)000-00-00', 'admin@korochki.ru', 'admin'],
            function(err) {
                if (err) {
                    console.log('❌ Ошибка создания админа:', err.message);
                } else {
                    console.log('✅ Админ создан: login=Admin, password=KorokNET');
                }
            }
        );
    } else {
        console.log('✅ Админ уже существует');
    }
});

// ===== РЕГИСТРАЦИЯ =====
app.post('/api/register', async (req, res) => {
    const { login, password, name, phone, email } = req.body;
    
    // Валидация
    if (!login || login.length < 6) {
        return res.status(400).json({ error: 'Логин должен быть не менее 6 символов' });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 8 символов' });
    }
    if (!name || !/^[А-Яа-яЁё\s]+$/.test(name)) {
        return res.status(400).json({ error: 'ФИО должно содержать только буквы кириллицы' });
    }
    if (!phone || !/^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(phone)) {
        return res.status(400).json({ error: 'Телефон в формате 8(XXX)XXX-XX-XX' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Неверный формат email' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            'INSERT INTO users (login, password, name, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
            [login, hashedPassword, name, phone, email, 'user'],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        res.status(400).json({ error: 'Логин или email уже занят' });
                    } else {
                        res.status(500).json({ error: 'Ошибка сервера' });
                    }
                } else {
                    res.json({ ok: true, message: 'Регистрация успешна' });
                }
            }
        );
    } catch(e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ВХОД =====
app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    
    db.get('SELECT * FROM users WHERE login = ?', [login], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        
        if (!valid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        delete user.password;
        res.json({ ok: true, user: user });
    });
});

// ===== СОЗДАТЬ ЗАЯВКУ =====
app.post('/api/application', (req, res) => {
    const { userId, course, date, payment } = req.body;
    
    if (!userId || !course || !date || !payment) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    db.run(
        'INSERT INTO applications (user_id, course, date, payment, status) VALUES (?, ?, ?, ?, ?)',
        [userId, course, date, payment, 'Новая'],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Ошибка при создании заявки' });
            } else {
                res.json({ ok: true, message: 'Заявка создана' });
            }
        }
    );
});

// ===== ПОЛУЧИТЬ ЗАЯВКИ ПОЛЬЗОВАТЕЛЯ =====
app.get('/api/applications/:userId', (req, res) => {
    db.all(
        'SELECT * FROM applications WHERE user_id = ? ORDER BY id DESC',
        [req.params.userId],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Ошибка при получении заявок' });
            } else {
                res.json(rows);
            }
        }
    );
});

// ===== ПОЛУЧИТЬ ВСЕ ЗАЯВКИ (ДЛЯ АДМИНА) =====
app.get('/api/all-applications', (req, res) => {
    db.all(
        `SELECT a.*, u.name, u.login, u.phone, u.email 
         FROM applications a 
         JOIN users u ON a.user_id = u.id 
         ORDER BY a.id DESC`,
        [],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Ошибка при получении заявок' });
            } else {
                res.json(rows);
            }
        }
    );
});

// ===== ИЗМЕНИТЬ СТАТУС ЗАЯВКИ =====
app.put('/api/application/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.run(
        'UPDATE applications SET status = ? WHERE id = ?',
        [status, id],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Ошибка при обновлении статуса' });
            } else {
                res.json({ ok: true, message: 'Статус обновлён' });
            }
        }
    );
});

// ===== ОСТАВИТЬ ОТЗЫВ =====
app.post('/api/review', (req, res) => {
    const { userId, applicationId, review } = req.body;
    
    db.run(
        'UPDATE applications SET review = ? WHERE id = ? AND user_id = ?',
        [review, applicationId, userId],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Ошибка при сохранении отзыва' });
            } else {
                res.json({ ok: true, message: 'Отзыв сохранён' });
            }
        }
    );
});

// ===== ЗАПУСК СЕРВЕРА =====
app.listen(3001, () => {
    console.log('🚀 Сервер запущен на http://localhost:3001');
});