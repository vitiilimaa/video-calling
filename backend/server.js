import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import 'dotenv/config'

const app = express();
const server = createServer(app);
const io = new Server(server);

const allUsers = {};
io.on("connection", (socket) => {
  socket.on("user-joined", ({ username, oneSignalSubscriptionId }) => {
    allUsers[username] = { id: socket.id, oneSignalSubscriptionId };
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
      const response = await fetch(
        "https://onesignal.com/api/v1/notifications",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${process.env.ONESIGNAL_API_KEY}`,
          },
          body: JSON.stringify(notificationData),
        }
      );

      const notification = await response.json();
      allUsers[to].notification_id = notification.id;
      allUsers[from].notification_id = notification.id;
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
    }
  });

  socket.on("answer", ({ from, to, answer }) => {
    io.to(allUsers[from].id).emit("answer", { from, to, answer });
  });

  socket.on("icecandidate", (candidate) => {
    // transmite para os outros peers
    socket.broadcast.emit("icecandidate", candidate);
  });

  socket.on("hangup-call", async () => {
    io.emit("call-ended", true);
  });

  socket.on("disconnect", () => {
    io.emit("call-ended", true);
    console.log("Usuário desconectado");
  });
});

server.listen(9000, () => {
  console.log("Servidor iniciado na porta 9000");
});
