import express from 'express';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface Viewer {
  id: string;
  name: string;
  isProducer: boolean;
}

interface Armchair {
  id: number;
  id_user: string;
  isBusy: boolean;
}

interface Room {
  id: string;
  armchairs: Set<Armchair>;
  isFull: boolean;
}

interface ExperienceState {
  viewers: Record<string, Viewer>;
  rooms: Record<string, Room>; 
}

interface Action {
  type: string;
  actor: string;
  sdp: string;
  parameters: Record<string, string>;
}

interface ServerResponse {
  type: string;
  expState: ExperienceState;
  parameters: Record<string, string>;
}

const wss = new WebSocket.Server({ port: 3000 });
const app = express();
const PORT = 8080; // HTTP para arquivos de vídeo

const users: Record<string, any> = {};
let expState: ExperienceState = { viewers: {}, rooms: {} };

function addViewer(ws: any): Viewer {
  const viewer: Viewer = {
    id: uuidv4(),
    name: "",
    isProducer: false
  };

  users[viewer.id] = ws;
  expState.viewers[viewer.id] = viewer;

  return viewer;
}

function sendGameState() {
  for (const [playerId, player] of Object.entries(expState.viewers)) {
    if(player.isProducer){
      const ws = users[player.id];
      
      const resp: ServerResponse = {
        type: "GameState",
        parameters: { playerId: playerId},
        expState: expState
      }

      ws.send(JSON.stringify(resp));
    }
  }
}

wss.on('connection', function connection(ws) {
    // Adiciona o viewer
  const viewer = addViewer(ws);
  console.log(`Viewer criado: ${viewer.id}`);

      // Enviar resposta de boas-vindas
  const welcomeAction: ServerResponse = {
    type: "Welcome",
    parameters: { playerId: viewer.id },
    expState: expState
  };
  ws.send(JSON.stringify(welcomeAction));

  ws.on('message', function incoming(message) {
    processMessage(message.toString(), ws);
  });

  ws.on("error", (err) => {
    console.log("error", err);
  })

  ws.on("close", () => {
    delete expState.viewers[viewer.id];
    delete users[viewer.id];

    console.log(`Viewer deletado: ${viewer.id}`);
  })
});

function processMessage(message: string, ws : any) {
  const action : Action = JSON.parse(message);

  if(action.type === "CreateRoom"){
    const newRoom : Room = {
      id: uuidv4(),
      armchairs: new Set(),
      isFull: false
    }
    expState.rooms[newRoom.id] = newRoom;
    SendNewRoom(action.actor, newRoom.id);
  }

  if(action.type === "EnterRoom"){
    const currentRoom = expState.rooms[action.parameters.room_id];
    if(!currentRoom.isFull){
      const armchair : Armchair = {
        id: currentRoom.armchairs.size+1,
        id_user: action.actor,
        isBusy: true
      }
      currentRoom.armchairs.add(armchair);
      if(currentRoom.armchairs.size == 30){
        currentRoom.isFull = true;
          const newRoom : Room = {
          id: uuidv4(),
          armchairs: new Set(),
          isFull: false
        }
        expState.rooms[newRoom.id] = newRoom;
        SendNewRoom(action.actor, newRoom.id);
      }
      sendArmchairID(action.actor, currentRoom.armchairs.size, currentRoom.id);
    }
  }
}

function SendNewRoom(userID: string, roomID: string){
  const ws = users[userID];

  const resp: ServerResponse = {
    type: "NewRoom",
    expState: expState,
    parameters: {userId: userID, room_id: roomID}
  }

  ws.send(JSON.stringify(resp));
}

function sendArmchairID(userID: string, armchairID: number, roomID: string){
  const ws = users[userID];

  const resp: ServerResponse = {
    type: "UpdadeRoom",
    expState: expState,
    parameters: {user_id: userID, armchair : armchairID.toString(), room_id: roomID}
  }

  ws.send(JSON.stringify(resp));
}

setInterval(() => {
  sendGameState();
}, 1000);

console.log('WebSocket server started on ws://localhost:3000');