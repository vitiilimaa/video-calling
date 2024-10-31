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
  socket.on("user-joined", ({ username, oneSignalSubscriptionId, photo }) => {
    allUsers[username] = { id: socket.id, oneSignalSubscriptionId, photo };
    io.emit("get-users", allUsers);
  });

  socket.on("offer", async ({ from, to, offer }) => {
    io.to(allUsers[to].id).emit("offer", { from, to, offer });

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

  socket.on("hangup-call", () => {
    io.emit("call-ended", true);
  });

  socket.on("disconnect", () => {
    socket.broadcast.emit("call-ended", true);
    console.log("Usuário desconectado");
  });
});

server.listen(9000, () => {
  console.log("Servidor iniciado na porta 9000");
});
