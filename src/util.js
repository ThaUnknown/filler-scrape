/**
 * @param {string} name
 */
export function parse (name) {
  /**
   * @type {{type: 'MOVIE' | 'OVA' | undefined, year: string | undefined, animeTitle: string}}
   */
  const result = {
    type: undefined,
    year: undefined,
    animeTitle: ''
  }
  // fuck regex
  if (name.endsWith(' Films') || name.endsWith(' Film')) {
    result.type = 'MOVIE'
    name = name.replace(/ Films?$/, '')
  } else if (name.endsWith(' OVAs') || name.endsWith(' OVA')) {
    name = name.replace(/ OVAs?$/, '')
    result.type = 'OVA'
  }

  const yearMatch = name.match(/\((\d{4})\)/)
  if (yearMatch?.[1]) {
    if (!result.type) result.year = yearMatch[1] // if title has year, it references the original anime, not this movie
    name = name.replace(/ \(\d{4}\)/, '')
  }

  name = name.replace(/ \([^)]+\)/, '') // remove alt titles, only use english

  result.animeTitle = name.trim()
  return result
}

export const sleep = t => new Promise(resolve => setTimeout(resolve, t).unref?.())

/**
 * @template T
 * @param {T[]} arr
 * @param {number} n
 */
export function * chunks (arr, n) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n)
  }
}
