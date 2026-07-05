// Dev-Postgres на системных бинарях (в песочнице нет Docker-демона).
// Обычная разработка — docker-compose.dev.yml; этот скрипт — эквивалент для CI/песочниц.
// Работает и под root: сервер запускается от системного пользователя postgres.
// Использование: node scripts/dev-db.mjs [start|stop|status]
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PG_BIN = '/usr/lib/postgresql/16/bin'
const DATA_DIR = path.join(root, '.data/pg')
const PORT = 5433
const USER = 'atelier'
const DB = 'atelier'

export const DATABASE_URL = `postgresql://${USER}@localhost:${PORT}/${DB}`

const isRoot = os.userInfo().uid === 0
// под root — от имени postgres; иначе — напрямую
const pg = (bin, args) => {
  const cmd = `${path.join(PG_BIN, bin)} ${args.join(' ')}`
  if (isRoot) return execSync(`su postgres -s /bin/sh -c ${JSON.stringify(cmd)}`, { encoding: 'utf8' })
  return execSync(cmd, { encoding: 'utf8' })
}

function isUp() {
  const r = spawnSync(path.join(PG_BIN, 'pg_isready'), ['-h', 'localhost', '-p', String(PORT)], {
    encoding: 'utf8',
  })
  return r.status === 0
}

export function startDb() {
  if (isUp()) return DATABASE_URL
  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    mkdirSync(DATA_DIR, { recursive: true })
    if (isRoot) execSync(`chown -R postgres:postgres ${JSON.stringify(DATA_DIR)}`)
    pg('initdb', ['-D', DATA_DIR, '-U', USER, '--auth=trust', '--no-instructions'])
  }
  pg('pg_ctl', [
    '-D',
    DATA_DIR,
    '-l',
    path.join(DATA_DIR, 'log'),
    '-o',
    `"-p ${PORT} -k /tmp -c listen_addresses=localhost"`,
    '-w',
    'start',
  ])
  const dbs = execFileSync(
    path.join(PG_BIN, 'psql'),
    ['-h', 'localhost', '-p', String(PORT), '-U', USER, '-d', 'postgres', '-tAc', 'SELECT datname FROM pg_database'],
    { encoding: 'utf8' },
  )
  if (!dbs.split('\n').includes(DB)) {
    execFileSync(path.join(PG_BIN, 'createdb'), ['-h', 'localhost', '-p', String(PORT), '-U', USER, DB])
  }
  return DATABASE_URL
}

export function stopDb() {
  if (!isUp()) return
  pg('pg_ctl', ['-D', DATA_DIR, '-m', 'fast', '-w', 'stop'])
}

const cmd = process.argv[2] ?? 'start'
if (cmd === 'start') {
  console.log(`✓ Postgres: ${startDb()}`)
} else if (cmd === 'stop') {
  stopDb()
  console.log('✓ Postgres остановлен')
} else if (cmd === 'status') {
  console.log(isUp() ? `up · ${DATABASE_URL}` : 'down')
}
