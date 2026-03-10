const { io } = require("socket.io-client");
const socket = io("http://localhost:5004");
socket.on("connect", () => {
  console.log("Connected");
  socket.emit("initializeConnection", (res) => console.log(res));
  socket.on("transcript", t => console.log("transcript:", t));
  socket.on("textOutput", t => console.log("textOutput:", t));
});
