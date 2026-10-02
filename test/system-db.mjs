import { spawn } from 'node:child_process'
import { parseJson } from './system-test-client.mjs'

export function db(database, query) {
  if (!['SOURCE', 'PLATFORM'].includes(database) || !/^\s*(SELECT|SHOW)\b/i.test(query)) throw new Error('Only read-only database checks are allowed')
  const encoded = Buffer.from(query).toString('base64')
  const script = [
    'set -e',
    "api_pid=$(tr -d '[:space:]' < /home/tjg/idmp/.run/idmp-bootstrap.pid)",
    "while IFS= read -r -d '' entry; do",
    '  case "$entry" in IDMP_SOURCE_DB_*=*|IDMP_PLATFORM_DB_*=*) export "$entry" ;; esac',
    'done < "/proc/$api_pid/environ"',
    'prefix=IDMP_' + database + '_DB',
    'urlkey="${prefix}_URL"; url="${!urlkey}"; url="${url#jdbc:mysql://}"',
    'hostport="${url%%/*}"; database="${url#*/}"; database="${database%%\\?*}"',
    'userkey="${prefix}_USERNAME"; passkey="${prefix}_PASSWORD"',
    'export MYSQL_PWD="${!passkey}"',
    'mysql --default-character-set=utf8mb4 -N -B --raw -h "${hostport%%:*}" -P "${hostport##*:}" -u "${!userkey}" "$database" -e "SET SESSION TRANSACTION READ ONLY; START TRANSACTION; $(printf %s ' + encoded + ' | base64 -d); ROLLBACK;"',
    ''
  ].join('\n')
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'lab-server', "tr -d '\\r' | bash -s"], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = '', error = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { error += data })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(output.trim().split('\n').filter(Boolean).map(parseJson)) : reject(new Error(`Read-only SQL failed: ${error.slice(0, 500)}`)))
    child.stdin.end(script)
  })
}
