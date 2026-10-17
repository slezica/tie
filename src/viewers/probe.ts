// Probe viewer (dev builds only): a content frame that hands itself to the harness. Scenarios run
// escape attempts in it (sec-content-escape) and post requests through its port.
interface Probe {
  port: MessagePort | null
  received: unknown[] // messages from the host over the port
  inits: number // tie:init handshakes seen
}
const probe: Probe = { port: null, received: [], inits: 0 }
;(window as unknown as { probe: Probe }).probe = probe

// Handshake: the host posts tie:init with one port after load; requests go over it.
addEventListener('message', (e) => {
  if (e.source !== parent || (e.data as { type?: string })?.type !== 'tie:init' || !e.ports[0]) return
  probe.inits++
  probe.port = e.ports[0]
  probe.port.onmessage = (m) => {
    // Watchdog: answer the host's pings (frame.ts). Not recorded.
    if (m.data?.type === 'tie:ping') return probe.port?.postMessage({ verb: 'pong', n: m.data.n })
    probe.received.push(m.data)
  }
  probe.port.postMessage({ verb: 'ready' })
})

document.body.textContent = 'probe'
