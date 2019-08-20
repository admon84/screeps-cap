const path = require('path')
const seedrandom = require('seedrandom')
const randomColor = require('randomcolor')
const fs = require('fs')
const TwitchBot = require('twitch-bot')
const { ScreepsAPI } = require('screeps-api')
const { GameRenderer } = require('@screeps/renderer')
const worldConfigs = require('./assets/worldConfigs')
const { resourceMap, rescaleResources } = require('./assets/resourceMap')
const argv = require('electron').remote.process.argv

let api = null
let renderer = null
let currentRoom = ''
let currentTerrain = null
let cachedObjects = {}
let state = {
  gameTime: 0,
  pvp: {
    rooms: []
  }
}
let chatRoom = ''
let chatRoomTimeout = 0
let mapRoomsCache = null
const ROOM_SWAP_INTERVAL = 10000
const teamMap = [
  { name: 'Alpha', users: ['geir', 'qgazq', 'eiskalt', 'dignissi'] },
  { name: 'Bravo', users: ['tigga', 'robalian', 'devnix', 'davaned'] },
  { name: 'Charlie', users: ['saruss', 'shibdib', 'sergey', 'snowgoose'] },
]
resetState()

Vue.component('ba-header', {
  props: ['state'],
  template: `
    <div>
      <div style="font-size: 32pt">Screeps Warfare Championship</div>
      <div>https://screepspl.us/events/</div>
      <div>http://chat.screeps.com #swc</div>
      <div>Room: {{state.room}}</div>
      <div>Time: {{state.gameTime}}</div>
    </div>`,
})

Vue.component('scoreboard', {
  props: [],
  template: `
    <div>
      <table>
        <tr>
          <th>#</th>
          <th style="text-align: left">Username</th>
          <th style="text-align: center">Rooms</th>
          <th style="text-align: center">Score</th>
        </tr>
        <tr v-for="(record, index) in slicedRecords" :key="record.username" v-if="!slicedTeams.length">
          <td>{{ index+1 }})</td>
          <td><img class="badge" :src="badgeURL(record.username)">{{record.username}}</td>
          <td style="text-align: center">{{record.rooms}}</td>
          <td style="text-align: center">{{record.score}}</td>
        </tr>
        <template v-for="(team, index) in slicedTeams" :key="team.name">
          <tr>
            <td>{{ index+1 }})</td>
            <td>{{team.name}}</td>
            <td style="text-align: center">{{team.rooms}}</td>
            <td style="text-align: center">{{team.score}}</td>
          </tr>
          <tr v-for="(record, index) in team.users" :key="record.username">
            <td></td>
            <td><img class="badge" :src="badgeURL(record.username)">{{record.username}}</td>
            <td style="text-align: center">{{record.rooms}}</td>
            <td style="text-align: center">{{record.score}}</td>
          </tr>
        </template>
      </table>
      <div v-if="records.length > 15">Only top 15 players listed</div>
      <div>Note: Score does not check for active spawns</div>
    </div>
    `,
  data() {
    return {
      updateInterval: null,
      rooms: [],
      users: {}
    }
  },
  mounted() {
    this.updateInterval = setInterval(() => this.update(), 5000)
    setTimeout(this.update, 1000)
  },
  unmount() {
    clearInterval(this.updateInterval)
  },
  computed: {
    records() {
      const records = []
      const uids = {}
      for (const { own } of this.rooms) {
        if (!own || !own.level) continue
        if (uids[own.user]) {
          uids[own.user].rooms++
          uids[own.user].score += own.level
        } else {
          uids[own.user] = {
            uid: own.user,
            rooms: 1,
            score: own.level
          }
        }
      }
      const data = Object.keys(uids).map(k => uids[k])
      data.sort((a, b) => b.score - a.score)
      for (let record of data) {
        const { score, rooms, uid } = record
        const { username } = this.users[uid]
        records.push({ username, rooms, score })
      }
      return records
    },
    slicedRecords() {
      return this.records.slice(0, 15)
    },
    slicedTeams() {
      const teams = teamMap.map(t => {
        const users = t.users.map(user => this.records.find(u => u.username.match(new RegExp(user, 'i')))).filter(Boolean)
        const rooms = users.reduce((l, u) => l + u.rooms, 0)
        const score = users.reduce((l, u) => l + u.score, 0)
        users.sort((a, b) => b.score - a.score)
        return { name: t.name, users, rooms, score }
      })
      teams.sort((a, b) => b.score - a.score)
      return teams
    }
  },
  methods: {
    badgeURL(username) {
      return `${api.opts.url}api/user/badge-svg?username=${username}`
    },
    async update() {
      while (!api) await sleep(1000)
      const { rooms, users } = await getMapRooms(api)
      // const { stats, users } = await api.raw.game.mapStats(roomList, 'owner0')
      // this.stats = stats
      this.rooms = rooms
      this.users = users
    }
  }
})

Vue.component("pvp-battles", {
  props: ['state'],
  template: `
    <div>
      <div>Recent Battles:</div>
      <transition-group name="battles">
        <div class="battle" v-for="b in battles" :key="b.room">
          <div class="room">{{ b.room }}</div>
          <div class="ticks">{{ b.ticks }} ticks ago</div>
        </div>
      </transition-group>
    </div>`,
  computed: {
    battles() {
      return state.pvp.rooms.map(({ _id: room, lastPvpTime }) => {
        const ticks = Math.max(0, state.gameTime - lastPvpTime)
        return { room, ticks }
      })
    }
  }
})

const app = new Vue({
  el: '#infoDiv',
  template: `
    <div id="infoDiv">
      <ba-header :state="state"></ba-header>
      <scoreboard></scoreboard>
      <br>
      <pvp-battles :state="state"></pvp-battles>
    </div>`,
  data() {
    return {
      state
    }
  }
})

const app2 = new Vue({
  el: '#usersDiv',
  template: `
    <div id="usersDiv">
      <transition-group name="users">
        <div v-for="user in users" :key="user._id">
          <img class="badge" :src="user.badgeUrl">
          {{user.username}}
        </div>
      </transition-group>
    </div>`,
  data() {
    return { state }
  },
  computed: {
    users() {
      return Object.values(this.state.users).filter(u => u._id.length > 1)
    }
  }
})

// Restart occasionally, sometimes the cycle breaks, this helps auto-recover
setTimeout(() => window.close(), 30 * 60 * 1000)
document.addEventListener('DOMContentLoaded', () => {
  map.setZoomFactor(0.9)
})
async function roomSwap() {
  // return setRoom('E7N5')
  while (true) {
    try {
      const { pvp } = await api.raw.experimental.pvp(100)
      const [shard = 'shard0'] = Object.keys(pvp)
      let { [shard]: { rooms } } = pvp
      state.pvp.rooms = rooms
      rooms.sort((a, b) => b.lastPvpTime - a.lastPvpTime)
      const now = Date.now()
      const append = rooms.filter(r => r.lastPvpTime > state.gameTime - 50).map(r => `${now},${r._id},${r.lastPvpTime}\n`).join('')
      fs.appendFile('pvp.csv', append, () => { })
      rooms = rooms.filter(r => r.lastPvpTime > state.gameTime - 10)
      let room = ''
      if (chatRoom && chatRoomTimeout > Date.now()) {
        room = chatRoom
      } else if (rooms.length) {
        const { _id, lastPvpTime: time } = rooms[Math.floor(Math.random() * rooms.length)]
        room = _id
      } else {
        // const { stats } = await api.raw.game.mapStats(roomList, 'owner0')
        const { rooms: rawRooms } = await getMapRooms(api)
        rooms = rawRooms.filter(r => r.own && r.own.level)
        room = rooms[Math.floor(Math.random() * rooms.length)].id
      }
      await setRoom(room)
    } catch (e) { console.error('roomSwap', e) }
    await sleep(ROOM_SWAP_INTERVAL)
  }
}

async function setRoom(room) {
  console.log(`setRoom ${room}`)
  let terrain = null
  if (room !== currentRoom) {
    let { terrain: [{ terrain: encoded } = {}] = [] } = await api.raw.game.roomTerrain(room, true)
    const types = ['plain', 'wall', 'swamp', 'wall']
    terrain = encoded.split('').filter(t => t).map((v, i) => ({
      x: i % 50,
      y: Math.floor(i / 50),
      type: types[v]
    }))
    currentTerrain = terrain
  }
  if (room !== currentRoom) {
    await api.socket.unsubscribe(`room:${state.room}`)
    console.log(`sub ${room}`)
    currentRoom = room
    await api.socket.subscribe(`room:${room}`)
  }
}

async function resetState() {
  Object.assign(state, {
    // objects: [],
    users: {
      '2': { _id: '2', username: 'Invader', usernameLower: 'invader', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 },
      '3': { _id: '3', username: 'Source Keeper', usernameLower: 'source keeper', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 },
    },
    room: currentRoom
  })
  cachedObjects = {}
  if (renderer) {
    renderer.erase()
    // renderer.applyState(state, 0)
  }
  // await sleep(100)
}

async function run() {
  api = await ScreepsAPI.fromConfig('botarena', 'screeps-cap')
  // await api.raw.register.submit(api.opts.username, api.opts.username, api.opts.username, { main: '' })
  const { twitch, chatTimeout = 60 } = api.appConfig
  if (twitch) {
    const Bot = new TwitchBot(twitch)
    Bot.on('join', channel => {
      console.log(`Joined channel: ${channel}`)
    })
    Bot.on('error', err => {
      console.log(err)
    })
    Bot.on('message', chatter => {
      const [, room] = chatter.message.match(/^!room ([EW]\d+[NS]\d+)$/) || []
      if (room) {
        setRoom(room)
        chatRoom = room
        chatRoomTimeout = Date.now() + (chatTimeout * 1000)
        Bot.say(`Switching to room ${room} on tick ${state.gameTime}`)
      }
    })
  }

  const view = mainDiv
  cachedObjects = {}
  const say = worldConfigs.metadata.objects.creep.processors.find(p => p.type === 'say')
  say.when = ({ state: { actionLog: { say } = {} } }) => !!say && say.isPublic
  GameRenderer.compileMetadata(worldConfigs.metadata)
  worldConfigs.BADGE_URL = `${api.opts.url}api/user/badge-svg?username=%1`
  renderer = new GameRenderer({
    size: {
      width: view.offsetWidth,
      height: view.offsetHeight
    },
    // autoFocus: false,
    resourceMap,
    rescaleResources,
    worldConfigs,
    onGameLoop: () => { },
    countMetrics: false,
    // fitToWorld: {
    //   width: 50,
    //   height: 50
    // },
    useDefaultLogger: false, //true,
    backgroundColor: 0x000000
    // backgroundColor: 0x505050
  })
  await renderer.init(view)
  {
    const t = []
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        t.push({ type: 'swamp', x, y, room: 'E0N0' })
      }
    }
    renderer.setTerrain(t)
  }
  renderer.resize()
  renderer.zoomLevel = 0.19 //view.offsetHeight / 5000
  console.log(renderer.zoomLevel, view.offsetWidth, view.clientWidth)
  await api.socket.connect()
  api.socket.on('message', async ({ type, channel, id, data, data: { gameTime = 0, info, objects, users = {}, visual } = {} }) => {
    if (type !== 'room') return
    if (state.reseting) return console.log('racing')
    if (id !== currentRoom) return await api.socket.unsubscribe(`room:${id}`)
    let { tick: tickSpeed = 1 } = await api.req('GET', '/api/game/tick')
    // let tickSpeed = 0.3
    if (state.room !== currentRoom) {
      tickSpeed = 0
      console.log(`reset`)
      await api.socket.unsubscribe(`room:${state.room}`)
      await Promise.all([
        resetState(),
        renderer.setTerrain(currentTerrain)
      ])
      console.log('setTerrain', currentTerrain)
      state.reseting = true
      const [, controller] = Object.entries(objects).find(([, obj]) => obj && obj.type == 'controller') || []
      worldConfigs.gameData.player = ''
      if (controller) {
        if (controller.user) {
          worldConfigs.gameData.player = controller.user
        }
        if (controller.reservation) {
          worldConfigs.gameData.player = controller.reservation.user
        }
      }
      delete state.reseting
    }
    for (const k in users) {
      state.users[k] = users[k]
    }
    for (const [id, diff] of Object.entries(objects)) {
      const cobj = cachedObjects[id] = cachedObjects[id] || {}
      if (diff === null) {
        delete cachedObjects[id]
      } else {
        cachedObjects[id] = Object.assign({}, cobj, diff)
      }
    }
    state.gameTime = gameTime || state.gameTime
    try {
      const objects = Array.from(Object.values(cachedObjects))
      const ns = Object.assign({ objects }, state)
      await renderer.applyState(ns, tickSpeed / 1000)
    } catch (e) {
      console.error('Error in update', e)
      await api.socket.unsubscribe(`room:${state.room}`)
      await sleep(100)
      const r = currentRoom
      state.room = currentRoom = ''
      setRoom(r) // Reset the view
    }
  })
  console.log('Complete!')
  await api.me()
  await minimap()
  roomSwap()
}


function XYToRoom(x, y) {
  let dx = 'E'
  let dy = 'S'
  if (x < 0) {
    x = -x - 1
    dx = 'W'
  }
  if (y < 0) {
    y = -y - 1
    dy = 'N'
  }
  return `${dx}${x}${dy}${y}`
}

function XYFromRoom(room) {
  let [, dx, x, dy, y] = room.match(/^([WE])(\d+)([NS])(\d+)$/)
  x = parseInt(x)
  y = parseInt(y)
  if (dx === 'W') x = -x - 1
  if (dy === 'N') y = -y - 1
  return { x, y }
}

async function getMapRooms(api, shard = 'shard0') {
  if (!mapRoomsCache) {
    console.log('Scanning sectors')
    const sectors = await scanSectors()
    let roomsToScan = []
    console.log('Sectors found:', sectors)
    for (let room of sectors) {
      let { x, y } = XYFromRoom(room)
      for (let xx = 0; xx < 12; xx++) {
        for (let yy = 0; yy < 12; yy++) {
          let room = XYToRoom(x + xx - 6, y + yy - 6)
          roomsToScan.push(room)
        }
      }
    }
    mapRoomsCache = roomsToScan
  }
  const { rooms, users } = await scan(mapRoomsCache)
  console.log(`GetMapRooms found ${rooms.length} rooms`)
  return { rooms, users }

  async function scanSectors() {
    const rooms = []
    for (let yo = -10; yo <= 10; yo++) {
      for (let xo = -10; xo <= 10; xo++) {
        const room = XYToRoom((xo * 10) + 5, (yo * 10) + 5)
        rooms.push(room)
      }
    }
    const result = await scan(rooms)
    return result.rooms.map(r => r.id)
  }

  async function scan(rooms = []) {
    if (!rooms.length) return { rooms: [], users: {} }
    const result = await api.raw.game.mapStats(rooms, shard, 'owner0')
    const ret = []
    for (const k in result.stats) {
      const { status, own } = result.stats[k]
      result.stats[k].id = k
      if (status === 'normal') {
        ret.push(result.stats[k])
      }
    }
    return { rooms: ret, users: result.users }
  }
}

async function minimap() {
  const colors = {
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
  }
  class MiniMapRoom {
    constructor(api, id, { colors }) {
      this.api = api
      this.id = id
      this.colors = colors
      this.api.socket.subscribe(`roomMap2:${id}`, (e) => this.handle(e))
      this.cont = new PIXI.Container()
      const { x, y } = XYFromRoom(id)
      this.cont.x = x * 50
      this.cont.y = y * 50
      this.cont.width = 50
      this.cont.height = 50
      this.img = PIXI.Sprite.from(`${api.opts.url}assets/map/${id}.png`)
      this.img.width = 50
      this.img.height = 50
      this.cont.addChild(this.img)
      this.overlay = new PIXI.Graphics()
      this.cont.addChild(this.overlay)
      this.badge = new PIXI.Sprite()
      this.badge.anchor.x = 0.5
      this.badge.anchor.y = 0.5
      this.badge.x = 25
      this.badge.y = 25
      this.cont.addChild(this.badge)
    }
    getColor(identifier) {
      if (!this.colors[identifier]) {
        const rng = seedrandom(identifier)
        const seed = rng().toString()
        this.colors[identifier] = randomColor({
          luminosity: 'bright',
          seed
        })
      }
      return parseInt(colors[identifier].slice(1), 16)
    }
    handle({ id, data }) {
      const { overlay } = this
      overlay.clear()
      for (const k in data) {
        const arr = data[k]
        overlay.beginFill(this.getColor(k))
        arr.forEach(([x, y]) => overlay.drawRect(x, y, 1, 1))
        overlay.endFill()
      }
    }
    update(roomInfo, users) {
      this.badge.visible = !!roomInfo.own
      if (roomInfo.own) {
        const user = users[roomInfo.own.user]
        const badgeURL = `${this.api.opts.url}api/user/badge-svg?username=${user.username}`
        this.badge.texture = PIXI.Texture.from(badgeURL)
        const size = (roomInfo.own.level * (20 / 8)) + 15
        this.badge.width = size
        this.badge.height = size
        this.badge.alpha = roomInfo.own.level ? 0.6 : 0.5
      }
    }
  }
  const { rooms, users } = await getMapRooms(api)
  const mapRooms = new Map()
  const miniMap = new PIXI.Container()
  window.miniMap = miniMap
  renderer.app.stage.addChild(miniMap)
  for (const room of rooms) {
    const r = new MiniMapRoom(api, room.id, { colors })
    r.update(room, users)
    mapRooms.set(room.id, r)
    miniMap.addChild(r.cont)
  }
  let lastRoom = ''
  setInterval(async () => {
    if (currentRoom === lastRoom) return
    if (!currentRoom) return
    lastRoom = currentRoom
    const { rooms, users } = await getMapRooms(api)
    for (const room of rooms) {
      const r = mapRooms.get(room.id)
      r.update(room, users)
    }
  }, 1000)
  const highlight = new PIXI.Graphics()
  // highlight.alpha = 0.5
  miniMap.addChild(highlight)
  setInterval(async () => {
    highlight.clear()
    state.pvp.rooms.forEach(({ _id: room, lastPvpTime }) => {
      const ticks = Math.max(0, state.gameTime - lastPvpTime)
      const { x, y } = XYFromRoom(room)
      highlight
        .lineStyle(1, 0xFF0000, 1 - (ticks / 100))
        .drawRect((x * 50), (y * 50), 50, 50)
    })
    if (currentRoom) {
      const { x, y } = XYFromRoom(currentRoom)
      highlight
        .lineStyle(1, 0x00FF00, 0.6)
        .drawRect((x * 50), (y * 50), 50, 50)
    }
  }, 500)
  const width = 580
  const xOffset = width + 10
  miniMap.x = -xOffset * (1 / renderer.app.stage.scale.x)
  miniMap.width = width * (1 / renderer.app.stage.scale.x)
  miniMap.scale.y = miniMap.scale.x
  miniMap.x += 50 * 10.5 * miniMap.scale.x
  miniMap.y += 50 * 10.5 * miniMap.scale.y
  renderer.app.stage.position.x = xOffset
  renderer.app.stage.mask = undefined
  // const mask = new PIXI.Graphics()
  // const { CELL_SIZE, VIEW_BOX } = worldConfigs
  // mask.drawRect(-CELL_SIZE / 2, -CELL_SIZE / 2, VIEW_BOX, VIEW_BOX)
  // mask.drawRect(miniMap.x, miniMap.y, miniMap.width, miniMap.height)
  // miniMap.addChild(mask)
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms))
}

run().catch(err => console.error(err))