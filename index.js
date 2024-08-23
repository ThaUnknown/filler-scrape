import { writeFile } from 'node:fs/promises'

import AnilistClient from './src/anilist.js'
import FillerScraper from './src/filler.js'
import { chunks, parse } from './src/util.js'

const scraper = new FillerScraper()
const client = new AnilistClient()

const fillerByAlID = {}

const fillers = await scraper.scrapeAllFillter()

/** @type {{key: string, title: string, year?: string, format?: string}[]} */
const titleObjects = []

for (const [name, episodes] of Object.entries(fillers)) {
  const { type, year, animeTitle } = parse(name)
  if (!type) {
    titleObjects.push({ key: name, title: animeTitle, year })
  } else {
    for (const { title } of episodes) {
      titleObjects.push({ key: name, title: `${animeTitle} ${title}`, year })
      titleObjects.push({ key: name, title: `${title}`, year })
    }
  }
}
console.log({ titleObjects })

for (const chunk of chunks(titleObjects, 50)) { // single title has a complexity of 8.1, al limits complexity to 500
  for (const [key, media] of await client.alSearchCompound(chunk)) {
    const episodes = fillers[key]
    const { type, animeTitle } = parse(key)
    console.log(animeTitle)
    if (!type) {
      if (media) {
        const fillers = []
        for (const { episode } of episodes) {
          fillers.push(Number(episode))
        }
        fillerByAlID[media.id] = fillers
      } else {
        console.log('Not found:', animeTitle)
      }
    } else {
      for (const { title } of episodes) {
        if (media) {
          fillerByAlID[media.id] = [1]
        } else {
          console.log('Not found:', animeTitle, title)
        }
      }
    }
  }
}

await writeFile('filler.json', JSON.stringify(fillerByAlID))
await writeFile('filler-readable.json', JSON.stringify(fillerByAlID, null, 2))
