const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const WebSocket = require('ws');
const session = require('express-session');
const MemoryStore = require('express-session').MemoryStore;
const cookieParser = require('cookie-parser');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const db = new sqlite3.Database(':memory:');
const wss = new WebSocket.Server({ noServer: true });

// db setup
const initSQL = fs.readFileSync('./db/init.sql', 'utf8');

db.serialize(() => {
    db.exec(initSQL, (err) => {
        if (err) {
            console.error('Error al inicializar la base de datos:', err.message);
        }
    });
});

// certificates setup
const options = {
    key: fs.readFileSync(path.join(__dirname, 'certificates', 'localhost-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certificates', 'localhost.pem'))
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const sessionStore = new MemoryStore();

app.use(session({
    store: sessionStore,
    secret: 'La-llave-maestra',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: true, 
        sameSite: 'none', 
        httpOnly: true,
    }
}));

app.use(cookieParser('La-llave-maestra'));

function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    } else {
        res.redirect('/');
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).send('Error interno');
        if (!user) return res.status(401).send('Usuario no encontrado');

        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.userId = user.id;
                res.redirect('/profile');
            } else {
                res.status(401).send('Contraseña incorrecta');
            }
        });
    });
});

app.get('/profile', isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    db.get('SELECT username, balance, iban FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).send('Error interno');
        res.render('profile', { user });
    });
});

// websocket server
wss.on('connection', (ws, req) => {
    const session = req.session; 

    if (session && session.userId) {
        const senderId = session.userId; 

        ws.on('message', (message) => {
            const { receiver, amount } = JSON.parse(message);

            if (amount <= 0 || isNaN(amount)) {
                return ws.send(JSON.stringify({ success: false, message: 'Monto no valido' }));
            }

            db.get('SELECT balance FROM users WHERE id = ?', [senderId], (err, sender) => {
                if (err || !sender) {
                    return ws.send(JSON.stringify({ success: false, message: 'Error al obtener el balance del sender' }));
                }

                if (sender.balance < amount) {
                    return ws.send(JSON.stringify({ success: false, message: 'Fondos insuficientes' }));
                }

                db.get('SELECT id FROM users WHERE iban = ?', [receiver], (err, recipient) => {
                    if (err || !recipient) {
                        return ws.send(JSON.stringify({ success: false, message: 'Destinatario no encontrado' }));
                    }

                    db.serialize(() => {
                        db.run(
                            'UPDATE users SET balance = balance - ? WHERE id = ?',
                            [amount, senderId],
                            (err) => {
                                if (err) return ws.send(JSON.stringify({ success: false, message: 'Error al descontar el saldo' }));
                            }
                        );

                        db.run(
                            'UPDATE users SET balance = balance + ? WHERE iban = ?',
                            [amount, receiver],
                            (err) => {
                                if (err) return ws.send(JSON.stringify({ success: false, message: 'Error al acreditar al destinatario' }));
                            }
                        );


                        ws.send(JSON.stringify({ success: true, message: 'Transferencia realizada' }));
                    });
                });
            });
        });
    } else {
        ws.send(JSON.stringify({ success: false, message: 'No autenticado' }));
    }
});

// Integrar WebSocket con servidor HTTP
const server = https.createServer(options, app).listen(3000, () => {
    console.log('Server running on: https://localhost:3000');
});

server.on('upgrade', (req, socket, head) => {

    const cookies = cookieParser.signedCookies(
        require('cookie').parse(req.headers.cookie || ''),
        'La-llave-maestra'
    );

    const sessionId = cookies['connect.sid'];

    if (!sessionId) {
        socket.destroy();
        return;
    }

sessionStore.get(sessionId, (err, session) => {
    if (err || !session) {
        console.error('No se pudo recuperar la sesión:', err);
        socket.destroy();
        return;
    }

        req.session = session; 
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });
});
