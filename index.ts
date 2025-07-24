import express from 'express';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface Viewer {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
  position_z: number;
  skin: Skin;
  isAdm: boolean;
}

interface Skin {
  body: number,
  skin: number,
  material: number
}

const skinStandard: Skin = {
  body: -1,
  skin: -1,
  material : -1
}

const room: Room = {
  id: "",
  capacity: 100,
  armchairs: new Set(),
  isFull: false
}
interface Armchair {
  id: number;
  id_user: string;
  isBusy: boolean;
}

interface Room {
  id: string;
  capacity: number;
  armchairs: Set<Armchair>;
  isFull: boolean;
}

interface ExperienceState {
  viewers: Record<string, Viewer>;
  room : Room;
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

// Servidor WebSocket para a webcam
const wssVideo = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });


wssVideo.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');

  ws.on('message', (data) => {
    // retransmite para todos os outros clientes
    wssVideo.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
        console.log("Enviando video");
      }
    });
  });
});

// Servidor Websocket para o multiplayer
const wss = new WebSocket.Server({ port: 3000, host: '0.0.0.0' });

const users: Record<string, any> = {};
let expState: ExperienceState = { viewers: {}, room};

function addViewer(ws: any): Viewer {
  const viewer: Viewer = {
    id: uuidv4(),
    name: "",
    position_x: 505,
    position_y: 3.3,
    position_z: 501,
    skin: skinStandard,
    isAdm: false
  };

  users[viewer.id] = ws;
  expState.viewers[viewer.id] = viewer;

  return viewer;
}

// Faz com que todo Set vire array automaticamente quando usar JSON.stringify
;(Set.prototype as any).toJSON = function () {
return Array.from(this);
};

function sendExpState() {
  for (const [playerId, player] of Object.entries(expState.viewers)) {
    const ws = users[player.id];
    
    const resp: ServerResponse = {
      type: "ExpState",
      parameters: { playerId: playerId},
      expState: expState
    }

    ws.send(JSON.stringify(resp));
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

    for (const [playerId, player] of Object.entries(expState.viewers)) {
      sendDeleteUser(playerId, viewer.id);
    }

    console.log(`Viewer deletado: ${viewer.id}`);
  })
});

function processMessage(message: string, ws : any) {
  const action : Action = JSON.parse(message);
  if(action.type === "CreateRoom"){
    room.id = uuidv4();

    // povoa ele com as cadeiras de acordo com a capacidade
    for(let ii=0; ii < Number(action.parameters.capacity); ii++){
      const armchair : Armchair = {
        id: room.armchairs.size+1,
        id_user: "",
        isBusy: false
      }
      room.armchairs.add(armchair);
    }
    // armazena e envia a informação para o cliente
    SendNewRoom(action.actor, room.id);
    sendRooms(action.actor);
  }

  if(action.type === "UpdateName"){
    const user = expState.viewers[action.actor];
    user.name = action.parameters.userName;
  }

  if(action.type === "EnterRoom"){
    if(!room.isFull){
      for(const el of room.armchairs){
        if(!el.isBusy){
          el.id_user = action.actor
          el.isBusy = true;
          return;
        }
      }
      room.isFull = true;
    }

    for (const [playerId, player] of Object.entries(expState.viewers)) {
      const ws = users[player.id];
      const currentPlayerID = playerId == action.actor ? true : false;
      
      if(!currentPlayerID){
        const resp: ServerResponse = {
          type: "ChangeScene",
          parameters: { playerId: playerId, otherUserID : action.actor},
          expState: expState
        }

        ws.send(JSON.stringify(resp));
      }
    }
  }

  if(action.type === "Skin"){ // atualiza a skin atual do player
    const player = expState.viewers[action.actor];
    player.name = action.parameters.userName;
    player.skin.body = Number(action.parameters.body);
    player.skin.skin = Number(action.parameters.skin);
    player.skin.material = Number(action.parameters.material);

    console.log("Skin: " + action.parameters.body + " " + action.parameters.skin + " " + action.parameters.material + " - " + action.parameters.userName);
  }

  if(action.type === "RequestSkin"){ // solicita a skin atual do player
    const player = expState.viewers[action.actor];
    console.log("Enviando skin...");
    sendSkin(player.id, player.skin.body, player.skin.skin, player.skin.material, player.name)
  }

  if(action.type === "RequestRoom"){ // solicita a sala
    const ocArmchairs = OccuppedArmchairs(room);
    sendRoom(action.actor, room.capacity, ocArmchairs, room.id);
  }

  if(action.type === "RequestArmchair"){
    let armchairID : number = 0;

    for(const armchair of room.armchairs){
      if(armchair.id_user == action.actor){
        armchairID = armchair.id;
        break;
      }
    }

    sendArmchairID(action.actor, armchairID, room.id);
  }

  if (action.type === "PositionUpdate") {
    console.log("PositionUpdate", action);
    const user = expState.viewers[action.actor];
    if (user) {
	    user.position_x = Number(action.parameters.position_x);
	    user.position_y = Number(action.parameters.position_y);
	    user.position_z = Number(action.parameters.position_z);
    }
  }

  if(action.type === "UpdateUser"){
    const user = expState.viewers[action.actor];
    user.isAdm = true;
  }
}

function OccuppedArmchairs(room: Room){
  let count = 0;
  for(const armchair of room.armchairs){
    if(armchair.isBusy){
      count++;
    }
  }
  return count;
}

function sendRooms(AdmId: string){
  for (const playerId of Object.keys(expState.viewers)) {
    if(playerId != AdmId){
      const ocArmchairs = OccuppedArmchairs(room);
      sendRoom(playerId, room.capacity, ocArmchairs, room.id);
    }
  }
}

function sendDeleteUser(userID: string, userDeletedID: string){
  const ws = users[userID];
  const resp: ServerResponse = {
    type: "DeleteUSer",
    expState: expState,
    parameters: {userId: userID, otherUserID: userDeletedID}
  }
  ws.send(JSON.stringify(resp));
}

function sendRoom(userID: string, capacity: number, OccuppedArmchairs: number, roomID: string){
  const ws = users[userID];
  const resp: ServerResponse = {
    type: "Room",
    expState: expState,
    parameters: {userId: userID, capacity: capacity.toString(), occuppedArmchairs: OccuppedArmchairs.toString(), roomId: roomID}
  }
  ws.send(JSON.stringify(resp));
}

function SendNewRoom(userID: string, roomID: string){
  const ws = users[userID];
  const resp: ServerResponse = {
    type: "NewRoom",
    expState: expState,
    parameters: {userId: userID, room_id: roomID}
  }
  console.log("sala criada!!!");
  ws.send(JSON.stringify(resp));
}

function sendArmchairID(userID: string, armchairID: number, roomID: string){
  const ws = users[userID];
  const resp: ServerResponse = {
    type: "ArmchairID",
    expState: expState,
    parameters: {user_id: userID, armchair : armchairID.toString(), room_id: roomID}
  }

  ws.send(JSON.stringify(resp));
}

function sendSkin(userID: string, body: number, skin: number, variant : number, name: string){
  const ws = users[userID];
  const resp: ServerResponse = {
    type: "Skin",
    expState: expState,
    parameters: {user_id: userID, userBody : body.toString(), userSkin: skin.toString(), userVariant: variant.toString(), userName : name}
  }

  ws.send(JSON.stringify(resp));
}

setInterval(() => {
  sendExpState();
}, 100);

console.log('WebSocket server started on ws://localhost:3000');