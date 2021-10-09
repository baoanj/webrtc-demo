const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const port = process.env.PORT || 3030

app.use(express.static(__dirname + '/public'))

const house = {}

io.on('connection', socket => {
  const id = socket.id

  socket.on('join', room => {
    socket.join(room)

    if (!house[room]) house[room] = []
    io.to(id).emit('join', { id, user: house[room] })
    house[room].push(id)
    io.to(room).emit('user', house[room])

    socket.on('drawing', data => socket.to(room).emit('drawing', data)) // sending to all clients except sender
    socket.on('chating', data => io.to(room).emit('chating', data)) // sending to all connected clients
    socket.on('offer', (to, data) => io.to(to).emit('offer', data))
    socket.on('answer', (to, data) => io.to(to).emit('answer', data))
    socket.on('candidate', (to, data) => io.to(to).emit('candidate', data))
  })

  socket.on('disconnecting', () => {
    socket.rooms.forEach(room => {
      if (house[room]) {
        house[room] = house[room].filter(item => item !== id)
        io.to(room).emit('user', house[room])
      }
    })
  })
})

http.listen(port, () => {
  console.log('listening on port ' + port)
})
