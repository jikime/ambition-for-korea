import { JudgeClient, choice } from '../server/claude'
const client = new JudgeClient()
const t0 = performance.now()
const r = await client.systemOne({
  state: { command: '부산 항만 쪽 보여줘' },
  questions: { site: choice('Which logistics site does `command` refer to?', { GJ: 'Gonjiam mega hub (곤지암)', BS: 'Busan New Port container terminal (부산신항, 항만)', IN: 'Incheon sub-terminal (인천)' }) },
})
console.log(Math.round(performance.now() - t0) + 'ms', r.model, JSON.stringify(r.answers), JSON.stringify(r.usage))
