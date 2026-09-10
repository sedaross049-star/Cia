const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// قاعدة البيانات المؤقتة
const db = {
    accounts: [
        { accountId: "acc_101", accountName: "MohammedAccount", password: "123", role: "Agent", maxCharacters: 3 }
    ],
    characters: [
        { characterId: "char_101", accountId: "acc_101", characterName: "Alexander Mahone", characterCode: "1531", publicCode: "ALPHA#1", role: "CIA CHIEF", isOnline: false }
    ]
};

io.on('connection', (socket) => {
    // 1. تسجيل الدخول بشخصية
    socket.on('login_character', (data) => {
        const charName = (data.characterName || '').trim();
        const charCode = (data.characterCode || '').trim();

        const character = db.characters.find(c => 
            c.characterName.toLowerCase() === charName.toLowerCase() && 
            c.characterCode === charCode
        );

        if (!character) {
            return socket.emit('auth_error', 'اسم الشخصية أو الكود غير صحيح!');
        }

        const account = db.accounts.find(a => a.accountId === character.accountId);
        character.isOnline = true;
        socket.currentSession = { accountId: account.accountId, characterId: character.characterId };

        socket.emit('auth_success', {
            accountId: account.accountId,
            characterId: character.characterId,
            characterName: character.characterName,
            role: character.role,
            publicCode: character.publicCode
        });
    });

    // 2. إنشاء حساب جديد
    socket.on('create_account', (data) => {
        const accName = (data.accountName || '').trim();
        const exist = db.accounts.find(a => a.accountName.toLowerCase() === accName.toLowerCase());

        if (exist) {
            return socket.emit('auth_error', 'اسم الحساب مستخدم من قبل!');
        }

        const newAccId = "acc_" + Date.now();
        const newCharId = "char_" + Date.now();

        db.accounts.push({
            accountId: newAccId,
            accountName: accName,
            password: data.password,
            role: "Agent",
            maxCharacters: 3
        });

        const newChar = {
            characterId: newCharId,
            accountId: newAccId,
            characterName: data.firstCharacterName.trim(),
            characterCode: data.firstCharacterCode.trim(),
            publicCode: "AGENT#" + Math.floor(1000 + Math.random() * 9000),
            role: "Agent",
            isOnline: true
        };

        db.characters.push(newChar);
        socket.currentSession = { accountId: newAccId, characterId: newCharId };

        socket.emit('auth_success', {
            accountId: newAccId,
            characterId: newCharId,
            characterName: newChar.characterName,
            role: newChar.role,
            publicCode: newChar.publicCode
        });
    });

    // 3. عرض الشخصيات مع التحقق
    socket.on('get_my_characters_verify', (data) => {
        const accName = (data.accountName || '').trim();
        const account = db.accounts.find(a => a.accountName.toLowerCase() === accName.toLowerCase() && a.password === data.password);

        if (!account) {
            return socket.emit('auth_error', 'بيانات الحساب غير صحيحة!');
        }

        const chars = db.characters.filter(c => c.accountId === account.accountId);
        socket.emit('receive_my_characters', chars);
    });

    // 4. الدخول المباشر لشخصية
    socket.on('direct_character_login', (data) => {
        const character = db.characters.find(c => c.characterId === data.characterId && c.accountId === data.accountId);
        if (!character) {
            return socket.emit('auth_error', 'تعذر العثور على الشخصية!');
        }

        socket.currentSession = { accountId: character.accountId, characterId: character.characterId };

        socket.emit('auth_success', {
            accountId: character.accountId,
            characterId: character.characterId,
            characterName: character.characterName,
            role: character.role,
            publicCode: character.publicCode
        });
    });

    // 5. تسجيل الخروج
    socket.on('logout', () => {
        socket.currentSession = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
