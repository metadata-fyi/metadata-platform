/** Lazy, validated shared FAQ storage; publication is independent of collection. */
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateRulingEvidence } from './tcg-ruling-evidence.mjs'
const defaultDirectory=fileURLToPath(new URL('../data/tcg/',import.meta.url))
const stores=new Map()
function load(directory){
 if(stores.has(directory))return stores.get(directory)
 const reportFile=path.join(directory,'yugioh-ja-ruling-report.json')
 if(!fs.existsSync(reportFile))return {status:'unavailable',byCard:new Map(),coverage:null}
 const report=JSON.parse(fs.readFileSync(reportFile,'utf8'))
 const coverage={language:'ja',expectedRulings:report.expectedRulings,capturedRulings:report.completedRulings,missingRulings:report.missingRulings,complete:report.complete,publishedToApi:report.publishedToApi,generatedAt:report.generatedAt}
 if(!report.publishedToApi||!report.complete)return {status:'staged',byCard:new Map(),coverage}
 const read=file=>{
  if(!/^[a-z0-9-]+\.json\.gz$/.test(file))throw new Error('Invalid ruling snapshot filename')
  return JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,file))).toString('utf8'))
 }
 const rows=read(report.stagingFile)
 validateRulingEvidence(report,read(report.indexFile),rows)
 const byCard=new Map()
 for(const row of rows){
  for(const cardId of row.publisherCardIds){
   const matches=byCard.get(cardId)??[]
   matches.push(row);byCard.set(cardId,matches)
  }
 }
 for(const values of byCard.values())values.sort((a,b)=>Number(a.publisherId)-Number(b.publisherId))
 const store={status:'published',byCard,coverage};stores.set(directory,store);return store
}
export function rulingsForPublisherCard(publisherCardId,{limit=20,offset=0,directory=defaultDirectory}={}){
 const store=load(directory)
 const lim=Number.isFinite(limit)?Math.min(100,Math.max(1,Math.floor(limit))):20
 const off=Number.isFinite(offset)?Math.max(0,Math.floor(offset)):0
 const rows=store.byCard.get(String(publisherCardId))??[]
 return {status:store.status,language:'ja',items:rows.slice(off,off+lim),total:rows.length,limit:lim,offset:off,coverage:store.coverage}
}
export function rulingsForTcgCard(card){
 if(card.gameId!=='yugioh')return undefined
 const gameplay=card.gameplay??{}
 const cid=gameplay.publisherCardId??gameplay.misc_info?.find(row=>row.konami_id)?.konami_id
 return rulingsForPublisherCard(cid??'')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);const value=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1]}
  console.log(JSON.stringify(rulingsForPublisherCard(value('--publisher-card-id',''),{directory:value('--directory',defaultDirectory),limit:Number(value('--limit','20')),offset:Number(value('--offset','0'))})))
 }catch(error){console.error(error.message);process.exitCode=1}
}
