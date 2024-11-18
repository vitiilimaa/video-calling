import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import "dotenv/config";

const app = express();
const server = createServer(app);
const io = new Server(server);

const apiOneSignalUrl = "https://onesignal.com/api/v1/";

const allUsers = {};
io.on("connection", (socket) => {
  socket.on(
    "user-joined",
    ({ username, oneSignalSubscriptionId, photo, log }) => {
      if (log) return console.log("log: ", log);

      allUsers[username] = {
        ...allUsers[username],
        id: socket.id,
        oneSignalSubscriptionId,
        photo,
      };
      console.log("allUsers", allUsers);
      io.emit("get-users", allUsers);
    }
  );

  socket.on("offer", async ({ from, to, offer }) => {
    if (allUsers[to].id)
      io.to(allUsers[to].id).emit("offer", { from, to, offer });
    allUsers[to].offer = offer;

    const notificationData = {
      app_id: process.env.ONESIGNAL_APP_ID,
      headings: { en: "Chamada recebida" },
      contents: { en: `Você está recebendo uma chamada de ${from}` },
      android_channel_id: process.env.ONESIGNAL_ANDROID_CHANNEL_ID,
      buttons: [
        { id: "accept-call", text: "Aceitar" },
        { id: "refuse-call", text: "Recusar" },
      ],
      include_subscription_ids: [allUsers[to].oneSignalSubscriptionId],
    };

    try {
      const response = await fetch(`${apiOneSignalUrl}/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.ONESIGNAL_API_KEY}`,
        },
        body: JSON.stringify(notificationData),
      });

      const notification = await response.json();
      allUsers[to].notification_id = notification.id;
      allUsers[from].notification_id = notification.id;
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
    }
  });

  socket.on("get-offer", ({ from }) => {
    const personWhoWillBeCalled = from;
    const personWhoWillCall = Object.keys(allUsers || {}).find(
      (key) => key !== from
    );

    const offer = allUsers[personWhoWillBeCalled].offer;
    socket.emit("get-offer", {
      from: personWhoWillCall,
      to: personWhoWillBeCalled,
      offer,
    });
  });

  socket.on("has-offer", ({ username }) => {
    const hasOffer = !!allUsers[username].offer;
    socket.emit("has-offer", hasOffer);
  });

  socket.on("answer", ({ from, to, answer }) => {
    io.to(allUsers[from].id).emit("answer", { from, to, answer, allUsers });
  });

  socket.on("offerCandidates", ({ candidate, to }) => {
    if (!allUsers[to]?.offerCandidates) {
      allUsers[to].offerCandidates = [];
    }

    allUsers[to].offerCandidates.push(candidate);
  });

  socket.on("answerCandidates", ({ candidate, to }) => {
    if (!allUsers[to]?.answerCandidates) {
      allUsers[to].answerCandidates = [];
    }

    allUsers[to].answerCandidates.push(candidate);
  });

  socket.on("offerIcecandidate", ({ to }) => {
    socket.emit("icecandidate", { candidates: allUsers[to].offerCandidates });
  });

  socket.on("answerIcecandidate", ({ from }) => {
    socket.emit("icecandidate", {
      candidates: allUsers[from].answerCandidates,
    });
  });

  socket.on("toggleVideo", ({ isActive, to }) => {
    socket.to(allUsers[to].id).emit("toggleVideo", isActive);
  });

  socket.on("toggleAudio", ({ isActive, to }) => {
    socket.to(allUsers[to].id).emit("toggleAudio", isActive);
  });

  socket.on("hangup-call", ({ from }) => {
    for (const [username] of Object.entries(allUsers)) {
      if (username === from) {
        allUsers[username].offerCandidates = [];
        allUsers[username].answerCandidates = [];
        allUsers[username].offer = null;
        allUsers[username].answer = [];
      } else {
        allUsers[username].offerCandidates = [];
        allUsers[username].answerCandidates = [];
        allUsers[username].offer = null;
        allUsers[username].answer = [];
      }
    }
    io.emit("call-ended", true);
  });

  socket.on("disconnect", () => {
    for (const [username, user] of Object.entries(allUsers)) {
      if (user.id === socket.id) {
        allUsers[username].id = "";
        allUsers[username].offerCandidates = [];
        allUsers[username].answerCandidates = [];
        allUsers[username].offer = null;
        allUsers[username].answer = [];
      } else {
        allUsers[username].offerCandidates = [];
        allUsers[username].answerCandidates = [];
        allUsers[username].offer = null;
        allUsers[username].answer = [];
      }
    }
    io.emit("get-users", allUsers);
    io.emit("call-ended", true);
    console.log("Usuário desconectado");
  });
});

server.listen(9000, () => {
  console.log("Servidor iniciado na porta 9000");
});
