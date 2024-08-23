import { load } from 'cheerio'

const EXCLUDES = ['Boruto: Naruto Next Generations (Definitive)', 'One Pace (One Piece)']

// extra safe to make sure they don't block us
const headers = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'max-age=0',
  priority: 'u=0, i',
  'sec-ch-ua': '"Not)A;Brand";v="99", "Microsoft Edge";v="127", "Chromium";v="128"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  Referer: 'https://www.animefillerlist.com/',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
}

/**
 * @param  {Parameters<globalThis.fetch>} args
 * @returns {Promise<Response>}
 */
async function fetch (...args) {
  const res = await globalThis.fetch(...args)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`)

  return res
}

export default class FillerScraper {
  origin = 'https://www.animefillerlist.com'
  animeList = this._getAnimeList()

  /**
   * Returns a record of anime title keyed objects of filler episode
   * @returns {Promise<Record<string, {title: string, episode: string}[]>>}
   */
  async scrapeAllFillter () {
    /** @type {Record<string, {title: string, episode: string}[]>} */
    const fillerShows = {}
    for (const [link, name] of await this.animeList) {
      console.log(name)
      const res = await fetch(new URL(link, this.origin), { headers })

      const $ = load(await res.text())

      const fillerList = $('table.EpisodeList .filler').toArray()
        .map(row => {
          const [episode, title] = $(row).find('td')
            .map((i, el) => $(el).text())
            .toArray().slice(0, 2)
          return { title, episode }
        })
      if (fillerList.length > 0) {
        fillerShows[name] = fillerList
      }
    }
    return fillerShows
  }

  async _getAnimeList () {
    const res = await fetch(new URL('/shows', this.origin), { headers })

    const $ = load(await res.text())

    return $('#ShowList a').toArray().map(el => [$(el).attr('href') || '', $(el).text()]).filter(predicate => !EXCLUDES.includes(predicate[1]))
  }
}
