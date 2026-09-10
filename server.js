const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// قواعد البيانات المؤقتة في الذاكرة (In-Memory Database)
let users = [];
let pendingRequests = []; // طلبات الانضمام 0012
let mapLocations = {};
let reports = []; // أرشيف القضايا والتقارير
let activeRadioChannel = 'CH-1';

// كود القيادة الافتراضي ورمز الحفظ
const CHIEF_JOIN_CODE = '1531';
const CHIEF_SECRET_SAVE_CODE = '4139';

// Socket.io Event Handling
io.on('connection', (socket) => {
  console.log(`[SYS] جهاز متصل جديد: ${socket.id}`);

  // إرسال البيانات الأولية للعميل عند الاتصال
  socket.emit('init:data', {
    locations: mapLocations,
    channel: activeRadioChannel
  });

  // تحديث الموقع على الخريطة
  socket.on('map:location:update', (data) => {
    mapLocations[data.code] = data;
    io.emit('map:location:broadcast', mapLocations);
  });

  // إزالة الموقع من الخريطة
  socket.on('map:location:remove', (data) => {
    if (mapLocations[data.code]) {
      delete mapLocations[data.code];
      io.emit('map:location:broadcast', mapLocations);
    }
  });

  // إرسال ندادات الطوارئ S.O.S
  socket.on('sos:alert:send', (sosData) => {
    const alertPayload = {
      ...sosData,
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      id: Date.now()
    };
    // بث التنبيه الفوري لجميع الأجهزة
    io.emit('sos:alert:broadcast', alertPayload);
  });

  // إشارات وبث الراديو التكتيكي (Push-To-Talk & 10-Codes)
  socket.on('radio:signal:send', (signalData) => {
    io.emit('radio:signal:broadcast', {
      ...signalData,
      timestamp: new Date().toLocaleTimeString('ar-EG')
    });
  });

  socket.on('disconnect', () => {
    console.log(`[SYS] قطع اتصال الجهاز: ${socket.id}`);
  });
});

// API Routes
app.post('/api/auth/login', (req, res) => {
  const { name, code } = req.body;

  // التحقق من كود تأسيس القيادة
  if (code === CHIEF_JOIN_CODE) {
    return res.json({
      status: 'CHIEF_SETUP_REQUIRED',
      message: 'يتطلب إدخال رمز الحفظ السرّي لتأسيس القيادة.'
    });
  }

  // طلب انضمام جديد عبر بوابة 0012
  if (code === '0012') {
    const existingPending = pendingRequests.find(p => p.name === name);
    if (!existingPending) {
      pendingRequests.push({ name, requestedAt: new Date().toLocaleString('ar-EG') });
    }
    return res.json({
      status: 'PENDING',
      message: 'تم إرسال طلب الانضمام إلى قائمة انتظار القيادة (CIA CHIEF).'
    });
  }

  const user = users.find(u => u.publicCode === code && u.name === name);
  if (user) {
    return res.json({ status: 'SUCCESS', user });
  }

  return res.status(401).json({ status: 'ERROR', message: 'بيانات الدخول غير صحيحة أو الحساب غير معتمد.' });
});

// تأسيس حساب القائد باستخدام رمز الحفظ 4139
app.post('/api/auth/setup-chief', (req, res) => {
  const { name, personalCode, saveCode } = req.body;

  if (saveCode !== CHIEF_SECRET_SAVE_CODE) {
    return res.status(403).json({ status: 'ERROR', message: 'رمز الحفظ السرّي غير صحيح!' });
  }

  const chiefUser = {
    name,
    publicCode: personalCode,
    rank: 'CIA CHIEF',
    role: 'CHIEF',
    isIdentityComplete: false
  };

  users.push(chiefUser);
  return res.json({ status: 'SUCCESS', user: chiefUser });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`CIA FIELD SYSTEM SERVER RUNNING`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`=================================`);
});
