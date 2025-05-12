import express from 'express';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface Viewer {
  id: string;
  name: string;
  isProducer: boolean;
}

interface Armchair {
  id: string;
  id_user: string;
  isBusy: boolean;
}

interface Room {
  id: string;
  armchairs: Armchair[];
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

const webClientSockets: Record<string, any> = {};
let unitySocket: any | null = null;
let expState: ExperienceState = { viewers: {}, rooms: {} };

function addViewer(ws: any): Viewer {
  const viewer: Viewer = {
    id: uuidv4(),
    name: "",
    isProducer: false
  };

  webClientSockets[viewer.id] = ws;
  expState.viewers[viewer.id] = viewer;

  return viewer;
}

function sendGameState() {
  for (const [playerId, player] of Object.entries(expState.viewers)) {
    if(player.isProducer){
      const ws = webClientSockets[player.id];
      
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
    delete webClientSockets[viewer.id];

    console.log(`Viewer deletado: ${viewer.id}`);
  })
});

function processMessage(message: string, ws : any) {
  const action : Action = JSON.parse(message);
  if (action.type === "producer") {
    const user = expState.viewers[action.actor];
    user.isProducer = true;
    console.log("Registrado como produtor");
  }
  if(action.type === "CreateRoom"){
    const room : Room = {
      id: uuidv4(),
      armchairs:
    }
    for(let ii=0; ii < 30; ii++){
      const armchair : Armchair = {
        id: uuidv4(),
        id_user: "",
        isBusy: false
      }

    }
  }
  if(action.type === "EnterRoom"){
    const user = expState.viewers[action.actor];

    const armchair : Armchair = {
      id: uuidv4(),
      id_user: user.id,
      isBusy: true
    }


  }
}

setInterval(() => {
  sendGameState();
}, 1000);
console.log('WebSocket server started on ws://localhost:300');