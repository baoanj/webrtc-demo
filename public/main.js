const socket = io()

/************************** draw **************************/

const canvas = document.getElementById('draw')
const whiteboard = document.querySelector('.whiteboard')
canvas.width = whiteboard.offsetWidth
canvas.height = whiteboard.offsetHeight
const context = canvas.getContext('2d')
const current = { color: 'red' }
let drawing = false

canvas.addEventListener('mousedown', onMouseDown, false)
canvas.addEventListener('mouseup', onMouseUp, false)
canvas.addEventListener('mouseout', onMouseUp, false)
canvas.addEventListener('mousemove', throttle(onMouseMove, 10), false)

//Touch support for mobile devices
canvas.addEventListener('touchstart', onMouseDown, false)
canvas.addEventListener('touchend', onMouseUp, false)
canvas.addEventListener('touchcancel', onMouseUp, false)
canvas.addEventListener('touchmove', throttle(onMouseMove, 10), false)

socket.on('drawing', onDrawingEvent)

function onDrawingEvent(data) {
  var w = canvas.width
  var h = canvas.height
  drawLine(data.x0 * w, data.y0 * h, data.x1 * w, data.y1 * h)
}

function drawLine(x0, y0, x1, y1, emit) {
  context.beginPath()
  context.moveTo(x0, y0)
  context.lineTo(x1, y1)
  context.strokeStyle = current.color
  context.lineWidth = 2
  context.stroke()
  context.closePath()

  if (!emit) return
  var w = canvas.width
  var h = canvas.height
  socket.emit('drawing', {
    x0: x0 / w,
    y0: y0 / h,
    x1: x1 / w,
    y1: y1 / h
  })
}

function onMouseDown(e) {
  drawing = true
  current.x = e.offsetX || e.changedTouches[0].pageX - canvas.offsetLeft
  current.y = e.offsetY || e.changedTouches[0].pageY - canvas.offsetTop
}

function onMouseUp(e) {
  if (!drawing) return
  drawing = false
  drawLine(
    current.x,
    current.y,
    e.offsetX || e.changedTouches[0].pageX - canvas.offsetLeft,
    e.offsetY || e.changedTouches[0].pageY - canvas.offsetTop,
    true
  )
}

function onMouseMove(e) {
  if (!drawing) return
  drawLine(
    current.x,
    current.y,
    e.offsetX || e.changedTouches[0].pageX - canvas.offsetLeft,
    e.offsetY || e.changedTouches[0].pageY - canvas.offsetTop,
    true
  )
  current.x = e.offsetX || e.changedTouches[0].pageX - canvas.offsetLeft
  current.y = e.offsetY || e.changedTouches[0].pageY - canvas.offsetTop
}

// limit the number of events per second
function throttle(callback, delay) {
  var previousCall = new Date().getTime()
  return function () {
    var time = new Date().getTime()

    if (time - previousCall >= delay) {
      previousCall = time
      callback.apply(null, arguments)
    }
  }
}

/************************** chat **************************/

const chat = document.querySelector('.chat')
const msg = document.querySelector('#msg')
const send = document.querySelector('#send')

send.addEventListener('click', onSendMsg, false)

socket.on('chating', onChatingEvent)

function onChatingEvent(data) {
  const li = document.createElement('li')
  li.textContent = data
  chat.prepend(li)
}

function onSendMsg() {
  socket.emit('chating', msg.value)
  msg.value = ''
}

/************************** video **************************/

const start = document.querySelector('.start')
const room = document.querySelector('#room')
const join = document.querySelector('#join')
const count = document.querySelector('#count')
const localVideo = document.querySelector('#local-video')
const talk = document.querySelector('.talk')

const iceConfig = {
  iceServers: [
    { url: 'stun:stunserver.org' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.xten.com' },
    { urls: 'stun:stun.ekiga.net' }
  ]
}

let id,
  stream,
  pc = {},
  user = []

join.addEventListener('click', onJoinRoom, false)

function onJoinRoom() {
  socket.emit('join', room.value)
}

socket.on('join', onJoinEvent)

async function onJoinEvent(data) {
  document.body.removeChild(start)
  await startLocalVideo()
  id = data.id
  data.user.forEach(item => {
    createPeerConnection(item, true)
  })
}

socket.on('user', onUserEvent)

function onUserEvent(data) {
  count.textContent = data.length
  user.forEach(item => {
    const video = document.getElementById(item)
    if (!data.includes(item) && video) talk.removeChild(video)
  })
  user = data
}

async function startLocalVideo() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  })
  localVideo.srcObject = stream
}

function createPeerConnection(key, send) {
  pc[key] = new RTCPeerConnection(iceConfig)
  if (send)
    pc[key].onnegotiationneeded = async () => {
      const offer = await pc[key].createOffer()
      await pc[key].setLocalDescription(offer)
      socket.emit('offer', key, { from: id, offer })
    }
  pc[key].onicecandidate = evt => {
    if (evt.candidate)
      socket.emit('candidate', key, { from: id, candidate: evt.candidate })
  }
  pc[key].ontrack = evt => {
    if (!document.getElementById(key)) {
      const remoteVideo = document.createElement('video')
      remoteVideo.id = key
      remoteVideo.autoplay = true
      remoteVideo.srcObject = evt.streams[0]
      talk.appendChild(remoteVideo)
    } else {
      document.getElementById(key).srcObject = evt.streams[0]
    }
  }
  stream.getTracks().forEach(track => pc[key].addTrack(track, stream))
}

socket.on('offer', handleReceiveOffer)

async function handleReceiveOffer({ from, offer }) {
  createPeerConnection(from)

  const remoteDescription = new RTCSessionDescription(offer)
  await pc[from].setRemoteDescription(remoteDescription)

  const answer = await pc[from].createAnswer()
  await pc[from].setLocalDescription(answer)
  socket.emit('answer', from, { from: id, answer })
}

socket.on('answer', handleReceiveAnswer)

async function handleReceiveAnswer({ from, answer }) {
  const remoteDescription = new RTCSessionDescription(answer)
  await pc[from].setRemoteDescription(remoteDescription)
}

socket.on('candidate', handleReceiveCandidate)

async function handleReceiveCandidate({ from, candidate }, n = 10) {
  if (n === 0) return
  if (
    pc[from] &&
    pc[from].remoteDescription &&
    pc[from].remoteDescription.type
  ) {
    await pc[from].addIceCandidate(new RTCIceCandidate(candidate))
  } else {
    setTimeout(() => {
      handleReceiveCandidate({ from, candidate }, n - 1)
    }, 500)
  }
}
