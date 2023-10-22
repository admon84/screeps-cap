const _ = require('lodash');
const fs = require('fs');
const { ScreepsAPI } = require('screeps-api');
const { GameRenderer } = require('@screeps/renderer');
const worldConfigs = require('./js/worldConfigs');
const { resourceMap, rescaleResources } = require('./js/resourceMap');

const origConsoleLog = console.log;
const log = (...args) => {
  fs.appendFile('output.log', args.join(' ') + '\n', () => {});
  origConsoleLog.apply(console, args);
};
console.log = (...a) => log(...a);
console.error = (...a) => log(...a);

const roomLevels = [2, 3, 4, 5, 6, 7, 8];

let api = null;
let renderer = null;
let currentRoom = '';
let currentTerrain = null;
let cachedObjects = {};
let mapRoomsCache = null;

let state = {
  dateTime: new Date(),
  gameTime: 0,
  startTime: 0,
  rcl: 0,
  rclTime: roomLevels.reduce((acc, level) => ({ ...acc, [level]: 0 }), [])
};

const SERVER = 'speedrun';
const TITLE = 'Speedrun';
const MINIMAP_RANGE = 2;

resetState();

Vue.component('event-header', {
  props: ['state'],
  template: `
    <div class="my-10">
      <div class="large">${TITLE}</div>
      <div class="mt-5">Date: {{state.dateTime.toLocaleDateString()}}</div>
      <div class="mt-5">Time: {{state.dateTime.toLocaleTimeString()}}</div>
      <div class="mt-5">Start tick: {{state.startTime}}</div>
      <div class="mt-5">Current tick: {{state.gameTime}}</div>
    </div>`
});

Vue.component('event-tracker', {
  props: [],
  template: `
    <div class="my-10">
      <div class="flex flex-row">
        <div class="bold left small">Event</div>
        <div class="bold center small">Ticks</div>
      </div>
      <div class="flex flex-row" v-for="(record, index) in records" :key="record.event">
        <div class="event">{{record.event}}</div>
        <div class="center">{{record.ticks}}</div>
      </div>
    </div>
    `,
  data() {
    return {
      updateInterval: null,
      rooms: [],
      users: {}
    };
  },
  mounted() {
    this.updateInterval = setInterval(() => this.update(), 1000);
    setTimeout(this.update, 1000);
  },
  unmount() {
    clearInterval(this.updateInterval);
  },
  computed: {
    records() {
      const records = [];
      for (const { own } of this.rooms) {
        if (!own || !own.level) continue;
        for (const rcl of roomLevels) {
          if (rcl <= own.level) {
            records.push({ event: `RCL${rcl}`, ticks: state.rclTime[rcl] });
          }
        }
      }
      return records;
    }
  },
  methods: {
    async update() {
      while (!api) await sleep(1000);
      const { rooms, users } = await getMapRooms(api);
      // const { stats, users } = await api.raw.game.mapStats(roomList, 'owner0')
      // this.stats = stats
      this.rooms = rooms;
      this.users = users;
    }
  }
});

const infoVue = new Vue({
  el: '#infoDiv',
  template: `
    <div id="infoDiv">
      <event-header :state="state"></event-header>
      <br>
      <event-tracker></event-tracker>
    </div>`,
  data() {
    return { state };
  }
});

async function setRoom(focusRoom) {
  console.log('setRoom:', focusRoom);
  let terrain = null;
  if (focusRoom !== currentRoom) {
    let { terrain: [{ terrain: encoded } = {}] = [] } = await api.raw.game.roomTerrain(focusRoom, true);
    const types = ['plain', 'wall', 'swamp', 'wall'];
    terrain = encoded
      .split('')
      .filter(t => t)
      .map((v, i) => ({
        x: i % 50,
        y: Math.floor(i / 50),
        type: types[v]
      }));
    currentTerrain = terrain;

    await api.socket.unsubscribe(`room:${state.room}`);
    currentRoom = focusRoom;
    await api.socket.subscribe(`room:${focusRoom}`);
  }
}

async function resetState() {
  Object.assign(state, {
    users: {
      2: {
        _id: '2',
        username: 'Invader',
        usernameLower: 'invader',
        cpu: 100,
        cpuAvailable: 10000,
        gcl: 13966610.2,
        active: 0
      },
      3: {
        _id: '3',
        username: 'Source Keeper',
        usernameLower: 'source keeper',
        cpu: 100,
        cpuAvailable: 10000,
        gcl: 13966610.2,
        active: 0
      }
    },
    room: currentRoom
  });
  cachedObjects = {};
  if (renderer) {
    renderer.erase();
    // renderer.applyState(state, 0)
  }
  await sleep(100);
}

function processStats(stats) {
  state.stats = stats;

  // from removed method processBattles()
  // battles.forEach(b => {
  //   b.ticks = Math.max(0, state.gameTime - b.lastPvpTime);
  // });
}

async function run() {
  setInterval(() => {
    state.dateTime = new Date();
  }, 1000);

  api = await ScreepsAPI.fromConfig(SERVER, 'screeps-cap');
  const { room: focusRoom } = api.appConfig;

  const view = mainDiv;
  cachedObjects = {};
  const say = worldConfigs.metadata.objects.creep.processors.find(p => p.type === 'say');
  say.when = ({ state: { actionLog: { say } = {} } }) => !!say && say.isPublic;
  GameRenderer.compileMetadata(worldConfigs.metadata);
  worldConfigs.BADGE_URL = `${api.opts.url}api/user/badge-svg?username=%1`;

  renderer = new GameRenderer({
    size: {
      width: view.offsetWidth,
      height: view.offsetHeight
    },
    // autoFocus: false,
    resourceMap,
    rescaleResources,
    worldConfigs,
    onGameLoop: () => {},
    countMetrics: false,
    // fitToWorld: {
    //   width: 50,
    //   height: 50
    // },
    useDefaultLogger: false, //true,
    backgroundColor: 0x000000 //0x505050
  });

  await renderer.init(view);
  const t = [];
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      t.push({ type: 'swamp', x, y, room: 'E0N0' });
    }
  }
  renderer.setTerrain(t);
  renderer.resize();
  renderer.zoomLevel = 0.2; //view.offsetHeight / 5000

  await api.socket.connect();
  api.socket.subscribe('stats:full');
  api.req('GET', '/stats').then(data => processStats(data));
  api.socket.on('stats:full', ({ data }) => processStats(data));
  api.socket.on(
    'message',
    async ({ type, channel, id, data, data: { gameTime = 0, info, objects, users = {}, visual } = {} }) => {
      if (type) if (type !== 'room') return;
      if (state.reseting) return console.log('racing');
      if (id !== currentRoom) return await api.socket.unsubscribe(`room:${id}`);
      let { tick: tickSpeed = 1 } = await api.req('GET', '/api/game/tick');
      if (state.room !== currentRoom) {
        tickSpeed = 0;
        await api.socket.unsubscribe(`room:${state.room}`);
        await Promise.all([resetState(), renderer.setTerrain(currentTerrain)]);
        // console.log('setTerrain', currentTerrain)
        state.reseting = true;
        const controller = Object.values(objects).find(o => o && o.type === 'controller');
        worldConfigs.gameData.player = '';
        if (controller) {
          if (controller.user) {
            worldConfigs.gameData.player = controller.user;
          }
          if (controller.reservation) {
            worldConfigs.gameData.player = controller.reservation.user;
          }
        }
        delete state.reseting;
      }
      for (const k in users) {
        state.users[k] = users[k];
      }
      for (const [id, diff] of Object.entries(objects)) {
        const cobj = (cachedObjects[id] = cachedObjects[id] || {});
        if (diff === null) {
          delete cachedObjects[id];
        } else {
          cachedObjects[id] = _.merge(cobj, diff);
        }
      }
      // update game time
      state.gameTime = gameTime || state.gameTime;
      // set start time
      if (!state.startTime) {
        state.startTime = state.gameTime;
      }
      try {
        const objects = _.cloneDeep(Array.from(Object.values(cachedObjects)));
        const ns = Object.assign({ objects }, state);
        await renderer.applyState(ns, tickSpeed / 1000);
      } catch (e) {
        console.error('Error in update', e);
        await api.socket.unsubscribe(`room:${state.room}`);
        await sleep(100);
        const r = currentRoom;
        state.room = currentRoom = '';
        setRoom(r); // Reset the view
      }
    }
  );

  await api.me();
  await minimap(focusRoom);
  await setRoom(focusRoom);
}

function XYToRoom(x, y) {
  let dx = 'E';
  let dy = 'S';
  if (x < 0) {
    x = -x - 1;
    dx = 'W';
  }
  if (y < 0) {
    y = -y - 1;
    dy = 'N';
  }
  return `${dx}${x}${dy}${y}`;
}

function XYFromRoom(room) {
  let [, dx, x, dy, y] = room.match(/^([WE])(\d+)([NS])(\d+)$/);
  x = parseInt(x);
  y = parseInt(y);
  if (dx === 'W') x = -x - 1;
  if (dy === 'N') y = -y - 1;
  return { x, y };
}

async function getMapRooms(api, room, shard = 'shard0') {
  if (!mapRoomsCache) {
    const roomsToScan = [];
    let { x, y } = XYFromRoom(room);
    for (let dx = -MINIMAP_RANGE; dx <= MINIMAP_RANGE; dx++) {
      for (let dy = -MINIMAP_RANGE; dy <= MINIMAP_RANGE; dy++) {
        let room = XYToRoom(x + dx, y + dy);
        roomsToScan.push(room);
      }
    }
    console.log(`getMapRooms: ${roomsToScan} rooms`);
    mapRoomsCache = roomsToScan;
  }
  const { rooms, users } = await scan(api, shard, mapRoomsCache);
  return { rooms, users };
}

async function scan(api, shard, rooms = []) {
  if (!rooms.length) return { rooms: [], users: {} };
  const { stats, users } = await api.raw.game.mapStats(rooms, shard, 'owner0');
  const normalRooms = [];
  for (const k in stats) {
    const { status } = stats[k];
    stats[k].id = k;
    if (status === 'normal') {
      normalRooms.push(stats[k]);
    }
  }
  return { rooms: normalRooms, users };
}

async function minimap(focusRoom) {
  const colors = {
    0: '#00FF00', // player
    2: '#FF9600', // invader
    3: '#FF9600', // source keeper
    w: '#000000', // wall
    r: '#3C3C3C', // road
    pb: '#FFFFFF', // powerbank
    p: '#00C8FF', // portal
    s: '#FFF246', // source
    m: '#AAAAAA', // mineral
    c: '#505050', // controller
    k: '#640000' // keeperLair
  };

  class MiniMapRoom {
    constructor(api, id, { colors, focusX, focusY }) {
      this.api = api;
      this.id = id;
      this.colors = colors;
      this.api.socket.subscribe(`roomMap2:${id}`, e => this.handle(e));
      this.cont = new PIXI.Container();
      const [offsetX, offsetY] = [focusX - MINIMAP_RANGE, focusY - MINIMAP_RANGE];
      const { x, y } = XYFromRoom(id);
      console.log('MiniMapRoom:', id, { x: x - offsetX, y: y - offsetY });
      this.cont.x = (x - offsetX) * 50;
      this.cont.y = (y - offsetY) * 50;
      this.cont.width = 50;
      this.cont.height = 50;
      this.img = PIXI.Sprite.from(`${api.opts.url}assets/map/${id}.png`);
      this.img.width = 50;
      this.img.height = 50;
      this.cont.addChild(this.img);
      this.overlay = new PIXI.Graphics();
      this.cont.addChild(this.overlay);
    }
    getColor(id) {
      if (!this.colors[id]) {
        this.colors[id] = this.colors[0];
      }
      return parseInt(colors[id].slice(1), 16);
    }
    handle({ data }) {
      const { overlay } = this;
      overlay.clear();
      for (const id in data) {
        const arr = data[id];
        overlay.beginFill(this.getColor(id));
        arr.forEach(([x, y]) => overlay.drawRect(x, y, 1, 1));
        overlay.endFill();
      }
    }
  }

  const { rooms } = await getMapRooms(api, focusRoom);
  const { x: focusX, y: focusY } = XYFromRoom(focusRoom);
  const mapRooms = new Map();
  const miniMap = new PIXI.Container();
  window.miniMap = miniMap;
  renderer.app.stage.addChild(miniMap);
  for (const room of rooms) {
    const r = new MiniMapRoom(api, room.id, { colors, focusX, focusY });
    mapRooms.set(room.id, r);
    miniMap.addChild(r.cont);
  }
  let lastRoom = '';
  setInterval(async () => {
    if (currentRoom === lastRoom) return;
    if (!currentRoom) return;
    lastRoom = currentRoom;
  }, 1000);

  // const highlight = new PIXI.Graphics();
  // highlight.alpha = 0.5;
  // miniMap.addChild(highlight);
  // setInterval(async () => {
  //   highlight.clear();
  //   if (currentRoom) {
  //     const { x, y } = XYFromRoom(currentRoom);
  //     highlight.lineStyle(1, 0x00ff00, 0.6).drawRect(x * 50, y * 50, 50, 50);
  //   }
  // }, 1000);

  const width = 420;
  miniMap.y = 80;
  miniMap.x = -width * (1 / renderer.app.stage.scale.x);
  miniMap.width = width * (1 / renderer.app.stage.scale.x);
  miniMap.scale.y = miniMap.scale.x;

  renderer.app.stage.position.x = width;
  renderer.app.stage.mask = undefined;

  // const mask = new PIXI.Graphics();
  // const { CELL_SIZE, VIEW_BOX } = worldConfigs;
  // mask.drawRect(-CELL_SIZE / 2, -CELL_SIZE / 2, VIEW_BOX, VIEW_BOX);
  // mask.drawRect(miniMap.x, miniMap.y, miniMap.width, miniMap.height);
  // miniMap.addChild(mask);
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

run().catch(err => {
  console.error(err);
  fs.appendFile('output.log', err.message + '\n', () => {});
});
