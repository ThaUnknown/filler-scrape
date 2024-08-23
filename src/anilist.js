import lavenshtein from 'js-levenshtein'
import Bottleneck from 'bottleneck'
import { sleep } from './util.js'

/**
 * @param {import('./al.d.ts').Media & {lavenshtein: number}} media
 * @param {string} name
 */
function getDistanceFromTitle (media, name) {
  const titles = Object.values(media.title).filter(v => v).map(title => lavenshtein(title.toLowerCase(), name.toLowerCase()))
  const synonyms = media.synonyms.filter(v => v).map(title => lavenshtein(title.toLowerCase(), name.toLowerCase()) + 2)
  const distances = [...titles, ...synonyms]
  const min = distances.reduce((prev, curr) => prev < curr ? prev : curr)
  media.lavenshtein = min
  return media
}

const queryObjects = /* js */`
id,
idMal,
title {
  romaji,
  english,
  native,
  userPreferred
},
episodes,
synonyms
`

export default class AnilistClient {
  limiter = new Bottleneck({
    reservoir: 90,
    reservoirRefreshAmount: 90,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 8,
    minTime: 120
  })

  rateLimitPromise = null

  /** @type {Record<number, import('./al.d.ts').Media>} */
  mediaCache = {}

  lastNotificationDate = Date.now() / 1000

  constructor () {
    this.limiter.on('failed', async (error, jobInfo) => {
      console.error(error)

      if (error.status === 500) return 1

      if (!error.statusText) {
        if (!this.rateLimitPromise) this.rateLimitPromise = sleep(61 * 1000).then(() => { this.rateLimitPromise = null })
        return 61 * 1000
      }
      const time = ((error.headers.get('retry-after') || 60) + 1) * 1000
      if (!this.rateLimitPromise) this.rateLimitPromise = sleep(time).then(() => { this.rateLimitPromise = null })
      return time
    })
  }

  /** @type {(options: RequestInit) => Promise<any>} */
  handleRequest = this.limiter.wrap(async opts => {
    await this.rateLimitPromise
    let res = {}
    try {
      res = await fetch('https://graphql.anilist.co', opts)
    } catch (e) {
      if (!res || res.status !== 404) throw e
    }
    if (!res.ok && (res.status === 429 || res.status === 500)) {
      throw res
    }
    let json = null
    try {
      json = await res.json()
    } catch (error) {
      if (res.ok) console.error(error)
    }
    if (!res.ok && res.status !== 404) {
      if (json) {
        for (const error of json?.errors || []) {
          console.error(error)
        }
      } else {
        console.error('Failed AL: ' + res.statusText)
      }
    }
    return json
  })

  /**
   * @param {string} query
   * @param {Record<string, any>} variables
   */
  alRequest (query, variables) {
    /** @type {RequestInit} */
    const options = {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        query: query.replace(/\s/g, '').replaceAll('&nbsp;', ' '),
        variables: {
          page: 1,
          perPage: 30,
          status_in: '[CURRENT,PLANNING]',
          ...variables
        }
      })
    }

    return this.handleRequest(options)
  }

  /**
   * @param {{key: string, title: string, year?: string, format?: string}[]} flattenedTitles
   **/
  async alSearchCompound (flattenedTitles) {
    if (!flattenedTitles.length) return []
    /** @type {Record<`v${number}`, string>} */
    const requestVariables = flattenedTitles.reduce((obj, { title }, i) => {
      obj[`v${i}`] = title
      return obj
    }, {})

    const queryVariables = flattenedTitles.reduce((arr, _, i) => {
      arr.push(`$v${i}: String`)
      return arr
    }, []).join(', ')
    const fragmentQueries = flattenedTitles.map(({ year, format }, i) => /* js */`
    v${i}: Page(perPage: 10) {
      media(type: ANIME, search: $v${i}, status_in: [RELEASING, FINISHED], ${year ? `, seasonYear: ${year}` : ''} ${format ? `, format: ${format}` : ''}) {
        ...med
      }
    }`)

    const query = /* js */`
    query(${queryVariables}) {
      ${fragmentQueries}
    }
    
    fragment&nbsp;med&nbsp;on&nbsp;Media {
      id,
      title {
        romaji,
        english,
        native
      },
      synonyms
    }`

    /**
     * @type {import('./al.d.ts').Query<Record<string, {media: import('./al.d.ts').Media[]}>>}
     * @returns {Promise<[string, import('./al.d.ts').Media][]>}
     * */
    const res = await this.alRequest(query, requestVariables)

    /** @type {Record<string, number>} */
    const searchResults = {}
    for (const [variableName, { media }] of Object.entries(res.data)) {
      if (!media.length) continue
      const titleObject = flattenedTitles[Number(variableName.slice(1))]
      if (searchResults[titleObject.key]) continue
      searchResults[titleObject.key] = media.map(media => getDistanceFromTitle(media, titleObject.title)).reduce((prev, curr) => prev.lavenshtein <= curr.lavenshtein ? prev : curr).id
    }

    const ids = Object.values(searchResults)
    const search = await this.searchIDS({ id: ids, perPage: 50 })
    return Object.entries(searchResults).map(([filename, id]) => [filename, search.data.Page.media.find(media => media.id === id)])
  }

  async searchIDS (variables) {
    const query = /* js */` 
    query($id: [Int], $page: Int, $perPage: Int) { 
      Page(page: $page, perPage: $perPage) {
        media(id_in: $id, type: ANIME) {
          ${queryObjects}
        }
      }
    }`

    /** @type {import('./al.d.ts').PagedQuery<{media: import('./al.d.ts').Media[]}>} */
    const res = await this.alRequest(query, variables)

    return res
  }
}
