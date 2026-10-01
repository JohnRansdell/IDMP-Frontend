const JSON_TOKEN = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]|\s+/g

export function tokenizeJson(value) {
  const source = JSON.stringify(value ?? {}, null, 2)
  return [...source.matchAll(JSON_TOKEN)].map((match) => {
    const text = match[0]
    let kind = ''
    if (text.startsWith('"')) {
      kind = /^\s*:/.test(source.slice(match.index + text.length)) ? 'key' : 'string'
    } else if (/^-?\d/.test(text)) {
      kind = 'number'
    } else if (text === 'true' || text === 'false') {
      kind = 'boolean'
    } else if (text === 'null') {
      kind = 'null'
    }
    return { text, kind }
  })
}
