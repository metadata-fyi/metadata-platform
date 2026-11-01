/** Immutable derived TCG read model. Runtime/payment data is never stored here. */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
const directory = new URL('../data/tcg/', import.meta.url)
const lower = value => String(value ?? '').toLowerCase()
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const read = file => {
 const bytes=fs.readFileSync(new URL(file,directory))
 return JSON.parse((file.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8'))
}
function sourceFiles(){
 const manifest=read('card-shards.json')
 for(const f of manifest.files)if(!/^cards-extra-\d{3}\.json(?:\.gz)?$/.test(f))throw Error('invalid TCG shard')
 return {manifest,files:['cards.json',...manifest.files]}
}
function fingerprints(files){return Object.fromEntries(['card-shards.json',...files].map(f=>[f,sha(fs.readFileSync(new URL(f,directory)))]))}
export function buildTcgDiskCatalog(destination){
 const {manifest,files}=sourceFiles()
 const sourceHashes=fingerprints(files)
 if(fs.existsSync(destination))throw Error('refusing to overwrite existing catalog index')
 fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true})
 const temporary=destination+'.building-'+process.pid
 const db=new Database(temporary)
 db.pragma('journal_mode = DELETE');db.pragma('cache_size = -8192');db.pragma('trusted_schema = OFF')
 db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE cards (
 id TEXT PRIMARY KEY,key TEXT UNIQUE NOT NULL,game TEXT NOT NULL,language TEXT NOT NULL,raw_language TEXT,
 source_key TEXT,setid TEXT,setcode TEXT,setname TEXT,number TEXT,sort_number TEXT,name TEXT NOT NULL,name_lower TEXT NOT NULL,
 rarity_lower TEXT,supertype_lower TEXT,types_json TEXT NOT NULL,subtypes_json TEXT NOT NULL,
 query TEXT NOT NULL,short_query TEXT NOT NULL,collector_dash TEXT,collector_colon TEXT,
 ord INTEGER NOT NULL,name_ord INTEGER NOT NULL);
 CREATE TABLE card_bodies (id TEXT PRIMARY KEY,json TEXT NOT NULL);
 CREATE TABLE aliases (key TEXT PRIMARY KEY,id TEXT NOT NULL);`)
 const columns=['id','key','game','language','raw_language','source_key','setid','setcode','setname','number','sort_number','name','name_lower','rarity_lower','supertype_lower','types_json','subtypes_json','query','short_query','collector_dash','collector_colon','ord','name_ord']
 const insert=db.prepare(`INSERT INTO cards (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`)
 const body=db.prepare('INSERT INTO card_bodies VALUES (?,?)')
 const alias=db.prepare('INSERT INTO aliases VALUES (?,?) ON CONFLICT(key) DO UPDATE SET id=CASE WHEN id=excluded.id THEN id ELSE NULL END')
 const facets=new Map();let count=0
 const tally=(map,values)=>{for(const value of values)map.set(value,(map.get(value)||0)+1)}
 try{
  for(const file of files){
   db.transaction(rows=>{
    for(const c of rows){
     const collector=c.setCode&&c.number?lower(c.gameId+'\0'+c.setCode+'\0'+c.number):null
     insert.run(c.id,lower(c.id),c.gameId,c.language??'en',c.language??null,c.gameId==='pokemon'&&c.sourceId?lower(c.sourceId):null,
      lower(c.setId),lower(c.setCode),lower(c.setName),lower(c.number),String(c.number),c.name,lower(c.name),lower(c.rarity),lower(c.supertype),
      JSON.stringify((c.types||[]).map(lower)),JSON.stringify((c.subtypes||[]).map(lower)),
      lower(`${c.name} ${c.number??''} ${c.setCode??''} ${c.setName??''} ${c.rarity??''} ${c.archetype??''} ${(c.tags||[]).join(' ')} ${c.text??''}`),
      lower(`${c.name} ${c.number??''} ${c.setCode??''}`),collector?.replaceAll('\0','-')??null,collector?.replaceAll('\0',':')??null,
      count,count)
     body.run(c.id,JSON.stringify(c))
     for(const a of c.aliases||[])alias.run(lower(a),c.id)
     let f=facets.get(c.gameId)
     if(!f){f={totalCards:0,rarities:new Map(),types:new Map(),subtypes:new Map()};facets.set(c.gameId,f)}
     f.totalCards++;tally(f.rarities,c.rarity?[c.rarity]:[]);tally(f.types,[...new Set(c.types||[])]);tally(f.subtypes,[...new Set(c.subtypes||[])])
     count++
    }
   })(read(file))
   if(global.gc)global.gc()
  }
  if(count!==manifest.totalCards)throw Error('TCG index count differs from manifest')
  const collision=db.prepare('SELECT a.key FROM aliases a JOIN cards c ON c.key=a.key WHERE c.id!=a.id LIMIT 1').get()
  if(collision)throw Error('ambiguous TCG alias '+collision.key)
  const order=db.prepare('SELECT id,game,name,sort_number,ord FROM cards ORDER BY ord').all()
  order.sort((a,b)=>a.game.localeCompare(b.game)||a.name.localeCompare(b.name)||a.sort_number.localeCompare(b.sort_number)||a.ord-b.ord)
  const update=db.prepare('UPDATE cards SET ord=? WHERE id=?')
  db.transaction(()=>{order.forEach((r,i)=>{update.run(i,r.id);r.ord=i})})()
  order.sort((a,b)=>a.name.localeCompare(b.name)||a.ord-b.ord)
  const nameUpdate=db.prepare('UPDATE cards SET name_ord=? WHERE id=?')
  db.transaction(()=>order.forEach((r,i)=>nameUpdate.run(i,r.id)))()
  // Stable locale ties follow catalog order, matching the resident backend.
  facets.clear()
  for(const row of db.prepare('SELECT game,rarity_lower,types_json,subtypes_json,b.json FROM cards c JOIN card_bodies b ON b.id=c.id ORDER BY ord').iterate()){
   const c=JSON.parse(row.json)
   let f=facets.get(c.gameId)
   if(!f){f={totalCards:0,rarities:new Map(),types:new Map(),subtypes:new Map()};facets.set(c.gameId,f)}
   f.totalCards++;tally(f.rarities,c.rarity?[c.rarity]:[]);tally(f.types,[...new Set(c.types||[])]);tally(f.subtypes,[...new Set(c.subtypes||[])])
  }
  const put=db.prepare('INSERT INTO meta VALUES (?,?)')
  const sorted=map=>[...map].map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value))
  for(const [game,f] of facets)put.run('facets:'+game,JSON.stringify({totalCards:f.totalCards,rarities:sorted(f.rarities),types:sorted(f.types),subtypes:sorted(f.subtypes)}))
  if(JSON.stringify(sourceHashes)!==JSON.stringify(fingerprints(files)))throw Error('TCG source changed during index build')
  put.run('provenance',JSON.stringify({version:1,totalCards:count,node:process.version,icu:process.versions.icu,files:sourceHashes}))
  db.exec('CREATE INDEX cards_game_order ON cards(game,ord);CREATE INDEX cards_language_order ON cards(language,ord);CREATE INDEX cards_game_language_order ON cards(game,language,ord);CREATE INDEX cards_source ON cards(source_key,language);CREATE INDEX cards_collector ON cards(game,setcode,number);CREATE INDEX cards_dash ON cards(collector_dash);CREATE INDEX cards_colon ON cards(collector_colon);CREATE INDEX cards_order ON cards(ord);CREATE INDEX cards_names ON cards(name_ord);ANALYZE;')
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('catalog integrity failure')
  db.close();fs.renameSync(temporary,destination)
  return {ok:true,cards:count,database:destination,bytes:fs.statSync(destination).size}
 }catch(e){db.close();fs.rmSync(temporary,{force:true});throw e}
}
export function openTcgDiskCatalog(file){
 const db=new Database(file,{readonly:true,fileMustExist:true})
 db.pragma('trusted_schema = OFF');db.pragma('query_only = ON');db.pragma('cache_size = -8192');db.pragma('mmap_size = 0')
 const provenance=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='provenance'").get()?.value||'null')
 const {manifest,files}=sourceFiles()
 if(!provenance||provenance.version!==1||provenance.totalCards!==manifest.totalCards||provenance.icu!==process.versions.icu||JSON.stringify(provenance.files)!==JSON.stringify(fingerprints(files)))throw Error('TCG index source/ICU mismatch; rebuild before starting')
 const cache=new Map();let cacheBytes=0
 function hydrate(row){
  if(!row)return undefined
  const existing=cache.get(row.id)
  if(existing){cache.delete(row.id);cache.set(row.id,existing);return existing.card}
  const card=JSON.parse(row.json)
  // Match the legacy enumerable gameplay getter's position in serialized records.
  if(card.gameplay!==undefined){const gameplay=card.gameplay;delete card.gameplay;card.gameplay=gameplay}
  const bytes=Buffer.byteLength(row.json)*2
  if(bytes<=4*1024*1024){
   cache.set(row.id,{card,bytes});cacheBytes+=bytes
   while(cache.size>128||cacheBytes>4*1024*1024){const key=cache.keys().next().value;cacheBytes-=cache.get(key).bytes;cache.delete(key)}
  }
  return card
 }
 const rows=(where='',params=[],limit=100,offset=0)=>db.prepare('SELECT picked.id,b.json FROM (SELECT id,ord FROM cards '+where+' ORDER BY ord LIMIT ? OFFSET ?) picked JOIN card_bodies b ON b.id=picked.id ORDER BY picked.ord').all(...params,limit,offset).map(hydrate)
 const countCache=new Map()
 function listCards(opts={}){
  const clauses=[],params=[]
  const add=(clause,...values)=>{clauses.push(clause);params.push(...values)}
  if(opts.game)add('game=?',lower(opts.game))
  if(opts.language)add('language=?',lower(opts.language))
  if(opts.set){const s=lower(opts.set);add('(setid=? OR setcode=? OR instr(setname,?)>0)',s,s,s)}
  const q=opts.q?.trim().toLowerCase();if(q)add('instr(query,?)>0',q)
  if(opts.rarity)add('instr(rarity_lower,?)>0',lower(opts.rarity))
  if(opts.type){const t=lower(opts.type);add('(instr(supertype_lower,?)>0 OR EXISTS (SELECT 1 FROM json_each(types_json) WHERE instr(value,?)>0) OR EXISTS (SELECT 1 FROM json_each(subtypes_json) WHERE instr(value,?)>0))',t,t,t)}
  if(opts.subtype)add('EXISTS (SELECT 1 FROM json_each(subtypes_json) WHERE instr(value,?)>0)',lower(opts.subtype))
  const where=clauses.length?'WHERE '+clauses.join(' AND '):''
  const countKey=JSON.stringify([where,params])
  let total=countCache.get(countKey)
  if(total===undefined){
   total=db.prepare('SELECT count(*) AS n FROM cards '+where).get(...params).n
   countCache.set(countKey,total)
   if(countCache.size>128)countCache.delete(countCache.keys().next().value)
  }else{countCache.delete(countKey);countCache.set(countKey,total)}
  const limit=Math.min(Math.max(opts.limit??40,1),100),offset=Math.max(opts.offset??0,0)
  return {items:rows(where,params,Math.trunc(limit),Math.trunc(offset)),total,limit,offset}
 }
 function getCard(id){
  const key=lower(id)
  const row=db.prepare('SELECT c.id,b.json FROM cards c JOIN card_bodies b ON b.id=c.id WHERE c.key=? UNION ALL SELECT c.id,b.json FROM aliases a JOIN cards c ON c.id=a.id JOIN card_bodies b ON b.id=c.id WHERE a.key=? LIMIT 1').get(key,key)
  if(row)return hydrate(row)
  const english=rows("WHERE source_key=? AND language='en'",[key],2)
  if(english.length===1)return english[0]
  const all=rows('WHERE source_key=?',[key],2)
  return all.length===1?all[0]:undefined
 }
 return {
  listCards,getCard,
  allCards:()=>rows('',[],manifest.totalCards),
  collector:(game,set,number)=>{const hits=rows('WHERE game=? AND (setcode=? OR setid=?) AND number=?',[lower(game),lower(set),lower(set),lower(number)],2);return hits.length===1?hits[0]:undefined},
  collectorAliases:key=>rows('WHERE collector_dash=? OR collector_colon=?',[lower(key),lower(key)],manifest.totalCards),
  matchMarket:({game,setCode,language,number,title})=>{
   const clauses=['number=?','instr(?,name_lower)>0'],params=[lower(number),lower(title)]
   if(game){clauses.push('game=?');params.push(game)}
   if(setCode){clauses.push('setcode=?');params.push(lower(setCode))}
   if(language){clauses.push('raw_language=?');params.push(lower(language))}
   return rows('WHERE '+clauses.join(' AND '),params,2)
  },
  facets:game=>JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get('facets:'+game)?.value||'null'),
  count:()=>manifest.totalCards,
  counts:()=>db.prepare('SELECT game,count(*) AS cards FROM cards GROUP BY game').all(),
  search:(query,limit,offset)=>{
   const total=db.prepare('SELECT count(*) AS n FROM cards WHERE instr(short_query,?)>0').get(query).n
   const selected=db.prepare('SELECT picked.id,b.json,picked.score FROM (SELECT id,name_ord,CASE WHEN instr(name_lower,?)=1 THEN 2.2 WHEN number=? THEN 2.4 ELSE 1.2 END AS score FROM cards WHERE instr(short_query,?)>0 ORDER BY score DESC,name_ord LIMIT ? OFFSET ?) picked JOIN card_bodies b ON b.id=picked.id ORDER BY picked.score DESC,picked.name_ord').all(query,query,query,Math.trunc(limit),Math.trunc(offset))
   return {total,items:selected.map(row=>({card:hydrate(row),score:row.score}))}
  },
 }
}
