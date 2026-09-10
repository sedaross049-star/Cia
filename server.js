const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// الرموز السرية الثابتة للقيادة العليا
const CHIEF_PASSCODE = "1531";  // رمز الدخول للقيادة
const SAVE_PASSCODE = "4139";   // رمز الحفظ للقيادة

// قاعدة البيانات المؤقتة بالسيرفر
const db = {
    chiefProfile: null, // الحفظ الآمن لبيانات القائد لمنع أي اختراق
    accounts: [],       // الحسابات
    characters: [],     // الشخصيات والهويات
    pendingAgents: [],  // قائمة الانتظار للموافقة
    generalReports: [], // التقارير العامة
    secretReports: [],  // التقارير السرية للقيادة فقط
    chatMessages: [],   // الشات العام
    secretChats: [],    // المحادثات المشفرة (تُراقب بالكامل لدى القيادة)
    teams: [],          // الفرق التكتيكية
    mapMarkers: []      // العلامات على الخريطة
};

io.on('connection', (socket) => {

    // 1. إنشاء حساب القائد (مع التحقق من كود الدخول وكود الحفظ)
    socket.on('create_chief_account', (data) => {
        if (data.chiefCode !== CHIEF_PASSCODE || data.saveCode !== SAVE_PASSCODE) {
            return socket.emit('auth_error', 'رمز القيادة أو كود الحفظ غير صحيح! تم رفض عملية الإنشاء.');
        }

        if (db.chiefProfile) {
            return socket.emit('auth_error', 'منظومة القيادة محجوزة بالفعل ومسجلة بحساب قائد سابق!');
        }

        const chiefAccId = "acc_chief_" + Date.now();
        const chiefCharId = "char_chief_" + Date.now();

        const chiefAccount = {
            accountId: chiefAccId,
            accountName: data.accountName.trim(),
            password: data.password,
            role: "CIA CHIEF"
        };

        const chiefCharacter = {
            characterId: chiefCharId,
            accountId: chiefAccId,
            fullName: data.fullName.trim(),
            publicCode: data.publicCode.trim(),
            characterCode: data.characterCode.trim(),
            birthPlace: data.birthPlace,
            role: "CIA CHIEF",
            status: "نشط بالميدان"
        };

        db.chiefProfile = { account: chiefAccount, character: chiefCharacter };
        db.accounts.push(chiefAccount);
        db.characters.push(chiefCharacter);

        socket.currentSession = { accountId: chiefAccId, characterId: chiefCharId, role: "CIA CHIEF" };
        socket.emit('auth_success', chiefCharacter);
    });

    // 2. إنشاء حساب عميل جديد (Agent) وإدخاله في قائمة الانتظار
    socket.on('create_agent_account', (data) => {
        const accName = data.accountName.trim();
        const exist = db.accounts.find(a => a.accountName.toLowerCase() === accName.toLowerCase());

        if (exist) {
            return socket.emit('auth_error', 'اسم الحساب مستخدم من قبل!');
        }

        const pendingId = "pend_" + Date.now();
        const newAgent = {
            pendingId: pendingId,
            accountName: accName,
            password: data.password,
            fullName: data.fullName.trim(),
            birthPlace: data.birthPlace,
            requestedAt: new Date().toLocaleTimeString('ar-EG')
        };

        db.pendingAgents.push(newAgent);
        socket.emit('waiting_approval', 'تم إرسال طلبك للقيادة العليا. أنت الآن في قائمة الانتظار حتى موافقة القائد.');

        // إشعار القائد والمساعدين المباشرين بوجود طلب جديد
        io.emit('update_pending_list', db.pendingAgents);
    });

    // 3. موافقة القائد/القيادة العليا على العميل وتعيين كود خاص له
    socket.on('approve_agent', (data) => {
        const session = socket.currentSession;
        if (!session || (session.role !== "CIA CHIEF" && session.role !== "Senior commander")) {
            return socket.emit('auth_error', 'غير مصرح لك بإجراء هذه العملية!');
        }

        const index = db.pendingAgents.findIndex(p => p.pendingId === data.pendingId);
        if (index === -1) return;

        const agentData = db.pendingAgents[index];
        const newAccId = "acc_" + Date.now();
        const newCharId = "char_" + Date.now();

        const agentAccount = {
            accountId: newAccId,
            accountName: agentData.accountName,
            password: agentData.password,
            role: "Agent"
        };

        const agentCharacter = {
            characterId: newCharId,
            accountId: newAccId,
            fullName: agentData.fullName,
            birthPlace: agentData.birthPlace,
            publicCode: data.assignedCode.trim(), // الكود المسند من القائد
            role: "Agent",
            status: "جاهز للميدان"
        };

        db.accounts.push(agentAccount);
        db.characters.push(agentCharacter);
        db.pendingAgents.splice(index, 1);

        io.emit('update_pending_list', db.pendingAgents);
        io.emit('agent_approved_notification', { accountName: agentData.accountName, assignedCode: agentCharacter.publicCode });
    });

    // 4. رفض العميل من قائمة الانتظار
    socket.on('reject_agent', (pendingId) => {
        const session = socket.currentSession;
        if (!session || (session.role !== "CIA CHIEF" && session.role !== "Senior commander")) return;

        db.pendingAgents = db.pendingAgents.filter(p => p.pendingId !== pendingId);
        io.emit('update_pending_list', db.pendingAgents);
    });

    // 5. تسجيل الدخول العام (بالكود الخاص)
    socket.on('login_character', (data) => {
        const code = data.code.trim();

        // التحقق مما إذا كان الدخول كقائد
        if (db.chiefProfile && db.chiefProfile.character.publicCode === code) {
            if (data.chiefPasscode !== CHIEF_PASSCODE) {
                return socket.emit('auth_error', 'محاولة دخول غير مصرح بها للقيادة! رمز الدخول السري غير صحيح.');
            }

            socket.currentSession = { 
                accountId: db.chiefProfile.account.accountId, 
                characterId: db.chiefProfile.character.characterId, 
                role: "CIA CHIEF" 
            };
            return socket.emit('auth_success', db.chiefProfile.character);
        }

        // تسجيل دخول الأفراد بالعموم
        const char = db.characters.find(c => c.publicCode === code);
        if (!char) {
            return socket.emit('auth_error', 'الكود السري غير موجود بالنظام!');
        }

        socket.currentSession = { accountId: char.accountId, characterId: char.characterId, role: char.role };
        socket.emit('auth_success', char);
    });

    // 6. إدارة الرتب والفصل من السلك العسكري
    socket.on('change_agent_rank', (data) => {
        const session = socket.currentSession;
        if (!session || (session.role !== "CIA CHIEF" && session.role !== "Senior commander")) return;

        const char = db.characters.find(c => c.publicCode === data.publicCode);
        if (char && char.role !== "CIA CHIEF") {
            char.role = data.newRank; // 1 Agent, 2 High commander cia, 3 Senior commander
            io.emit('system_data_update');
        }
    });

    socket.on('dismiss_agent', (publicCode) => {
        const session = socket.currentSession;
        if (!session || (session.role !== "CIA CHIEF" && session.role !== "Senior commander")) return;

        const index = db.characters.findIndex(c => c.publicCode === publicCode);
        if (index !== -1 && db.characters[index].role !== "CIA CHIEF") {
            const dismissed = db.characters.splice(index, 1)[0];
            io.emit('agent_dismissed_alert', { publicCode: dismissed.publicCode });
        }
    });

    // 7. التقارير العامة والسرية
    socket.on('submit_report', (data) => {
        const session = socket.currentSession;
        if (!session) return;

        const char = db.characters.find(c => c.characterId === session.characterId);
        const report = {
            id: "rep_" + Date.now(),
            authorCode: char.publicCode,
            title: data.title,
            content: data.content,
            imageUrl: data.imageUrl || null,
            time: new Date().toLocaleTimeString('ar-EG')
        };

        if (data.isSecret) {
            db.secretReports.push(report);
            io.emit('update_secret_reports', db.secretReports);
        } else {
            db.generalReports.push(report);
            io.emit('update_general_reports', db.generalReports);
        }
    });

    socket.on('delete_report', (data) => {
        const session = socket.currentSession;
        if (!session || (session.role !== "CIA CHIEF" && session.role !== "Senior commander")) return;

        if (data.isSecret) {
            db.secretReports = db.secretReports.filter(r => r.id !== data.reportId);
            io.emit('update_secret_reports', db.secretReports);
        } else {
            db.generalReports = db.generalReports.filter(r => r.id !== data.reportId);
            io.emit('update_general_reports', db.generalReports);
        }
    });

    // 8. نظام بلاغات SOS والرسائل والتلقائية (30 ثانية شاشة حمراء)
    socket.on('send_sos_alert', (data) => {
        const session = socket.currentSession;
        if (!session) return;

        const char = db.characters.find(c => c.characterId === session.characterId);
        const sosData = {
            senderCode: char.publicCode,
            count: data.count,
            location: data.location,
            type: data.type, // جنيات / اعتقال / إسقاط
            timestamp: Date.now()
        };

        io.emit('trigger_sos_red_screen', sosData);
    });

    // 9. المحادثات المشفرة السرية مراقبة القيادة
    socket.on('send_secret_chat_msg', (data) => {
        const session = socket.currentSession;
        if (!session) return;

        const char = db.characters.find(c => c.characterId === session.characterId);
        const msg = {
            id: "sec_" + Date.now(),
            senderCode: char.publicCode,
            receiverCode: data.receiverCode,
            text: data.text,
            time: new Date().toLocaleTimeString('ar-EG')
        };

        db.secretChats.push(msg);
        io.emit('receive_secret_chat_msg', msg);
    });

    // 10. الفرق التكتيكية
    socket.on('create_tactical_team', (data) => {
        const session = socket.currentSession;
        if (!session || (session.role !== "CIA CHIEF" && session.role !== "Senior commander" && session.role !== "High commander cia")) return;

        const team = {
            id: "team_" + Date.now(),
            name: data.teamName,
            members: data.selectedCodes
        };

        db.teams.push(team);
        io.emit('update_teams_list', db.teams);
    });

    // إرسال البيانات المبدئية عند الاتصال
    socket.on('request_initial_data', () => {
        socket.emit('init_system_state', {
            pendingCount: db.pendingAgents.length,
            generalReports: db.generalReports,
            secretReports: db.secretReports,
            teams: db.teams,
            pendingAgents: db.pendingAgents,
            activeMembers: db.characters.map(c => ({
                publicCode: c.publicCode,
                role: c.role,
                status: c.status,
                // الهوية الكاملة مخفية إلا للقائد و Senior commander
                fullName: c.fullName,
                birthPlace: c.birthPlace
            }))
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`BLACK RIDGE CIA SYSTEM ONLINE ON PORT ${PORT}`));
            
