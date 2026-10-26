
/* ===== چهارمی‌ها: حالت آفلاین رمزگذاری‌شده با PIN محلی ===== */
(function initFouramiOfflineMode(){
  const DB_NAME='fourami-offline-v1';
  const DB_VERSION=1;
  const STORE_NAME='student_packages';
  const KDF_ITERATIONS=250000;
  const encoder=new TextEncoder();
  const decoder=new TextDecoder();
  const $offline=id=>document.getElementById(id);
  // Initialize offline state before any focus/online handler can read it.
  let fouramiOfflineData=null;
  let fouramiOfflineKey=null;
  let fouramiOfflineSalt=null;
  let fouramiOfflineRecord=null;
  let fouramiOfflineSaveChain=Promise.resolve();
  let fouramiOfflineSyncInProgress=false;
  const FOURAMI_OFFLINE_BOOK_CACHE='fourami-book-pages-v1';
  const FOURAMI_BOOK_SUBJECTS=['math','persian','science','social','gifts','quran'];
  let fouramiOfflineAssetPreloadPromise=null;
  if(!Array.isArray(window.cloudBankRows))window.cloudBankRows=[];
  // Clone JSON-compatible app data without depending on a helper from index.html.
  function fouramiClone(value){
    if(value===undefined)return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  const defaultProgress=()=>({attempts:0,correct:0,streak:0,bestStreak:0,byChapter:{},questionHistory:{}});
  function fouramiNormalizeUsername(value){return String(value||'').trim().toLowerCase()}
  function fouramiNormalizePin(value){return String(value||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim()}
  function fouramiMergeOtherProgress(cached,local){
    const merged=fouramiClone(cached||{});
    for(const [key,value] of Object.entries(local||{})){
      const old=merged[key];
      const oldTime=Date.parse(old?.updatedAt||'')||0;
      const newTime=Date.parse(value?.updatedAt||'')||0;
      if(!old||newTime>=oldTime)merged[key]=value;
    }
    return merged;
  }
  function bytesToBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s)}
  function base64ToBytes(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0))}
  function openDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('این مرورگر ذخیره‌سازی محلی لازم برای حالت آفلاین را پشتیبانی نمی‌کند.'));return}
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        const store=db.objectStoreNames.contains(STORE_NAME)?req.transaction.objectStore(STORE_NAME):db.createObjectStore(STORE_NAME,{keyPath:'studentId'});
        if(!store.indexNames.contains('username'))store.createIndex('username','username',{unique:false});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('باز کردن فضای آفلاین ناموفق بود.'));
    });
  }
  async function readPackageByStudent(studentId){
    const db=await openDb();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readonly');
      const request=tx.objectStore(STORE_NAME).get(String(studentId));
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error||new Error('خواندن بستهٔ آفلاین ناموفق بود.'));
    })}finally{db.close()}
  }
  async function readPackageByUsername(username){
    const db=await openDb();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readonly');
      const request=tx.objectStore(STORE_NAME).index('username').get(fouramiNormalizeUsername(username));
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error||new Error('پیدا کردن بستهٔ آفلاین ناموفق بود.'));
    })}finally{db.close()}
  }
  async function writePackage(record){
    const db=await openDb();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('ذخیرهٔ بستهٔ آفلاین ناموفق بود.'));
      tx.onabort=()=>reject(tx.error||new Error('ذخیرهٔ بستهٔ آفلاین متوقف شد.'));
    })}finally{db.close()}
  }
  async function deriveOfflineKey(pin,salt){
    const material=await crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveKey']);
    return await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:KDF_ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  function makeQuestionSnapshot(q){
    return {id:String(q?.id||''),chapter:Number(q?.chapter||q?.chapter_id||1),skill:String(q?.skill||''),q:String(q?.q||q?.prompt||q?.question||''),type:String(q?.type||q?.question_type||'mc'),opts:Array.isArray(q?.opts)?q.opts.map(String):(Array.isArray(q?.options)?q.options.map(String):[])};
  }
  function captureCurrentSession(){
    if(!fouramiOfflineData||!cloudSession?.user?.id)return;
    fouramiOfflineData.session={
      access_token:cloudSession.access_token||'',
      refresh_token:cloudSession.refresh_token||'',
      user:{id:cloudSession.user.id,email:cloudSession.user.email||''},
      username:cloudSession.username||fouramiOfflineData.username
    };
    fouramiOfflineData.profile=fouramiClone(cloudSession.profile||fouramiOfflineData.profile);
    fouramiOfflineData.studentProgress=fouramiClone(studentProgress||defaultProgress());
  }
  function savePackage(){
    if(!fouramiOfflineData||!fouramiOfflineKey||!fouramiOfflineSalt||!fouramiOfflineRecord)return Promise.reject(new Error('بستهٔ آفلاین باز نیست.'));
    const dataRef=fouramiOfflineData,keyRef=fouramiOfflineKey,saltRef=new Uint8Array(fouramiOfflineSalt),recordRef=fouramiOfflineRecord;
    fouramiOfflineSaveChain=fouramiOfflineSaveChain.catch(()=>{}).then(async()=>{
      if(!dataRef||!keyRef)throw new Error('بستهٔ آفلاین دیگر باز نیست.');
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},keyRef,encoder.encode(JSON.stringify(dataRef)));
      const nextRecord={...recordRef,studentId:String(dataRef.studentId),username:fouramiNormalizeUsername(dataRef.username),salt:bytesToBase64(saltRef),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(cipher)),updatedAt:new Date().toISOString()};
      await writePackage(nextRecord);
      if(fouramiOfflineData===dataRef)fouramiOfflineRecord=nextRecord;
    });
    return fouramiOfflineSaveChain;
  }
  async function decryptPackage(record,pin){
    if(record.lockUntil&&record.lockUntil>Date.now())throw new Error('پس از چند تلاش ناموفق، ورود موقتاً قفل شده است. کمی بعد دوباره تلاش کن.');
    const salt=base64ToBytes(record.salt),iv=base64ToBytes(record.iv),cipher=base64ToBytes(record.ciphertext);
    const key=await deriveOfflineKey(pin,salt);
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher);
    const data=JSON.parse(decoder.decode(clear));
    if(data.version!==1||String(data.studentId)!==String(record.studentId)||fouramiNormalizeUsername(data.username)!==fouramiNormalizeUsername(record.username))throw new Error('بستهٔ آفلاین با این حساب مطابقت ندارد.');
    return {data,key,salt};
  }
  function clearIfDifferent(studentId){
    if(fouramiOfflineData&&String(fouramiOfflineData.studentId)!==String(studentId)){
      fouramiOfflineData=null;fouramiOfflineKey=null;fouramiOfflineSalt=null;fouramiOfflineRecord=null;
      const banner=$offline('fouramiOfflineSessionBanner');if(banner)banner.classList.add('hidden');
    }
  }
  function updateStatus(message,isError=false){
    const profileStatus=$offline('fouramiOfflineProfileStatus');
    if(profileStatus){profileStatus.textContent=message;profileStatus.style.color=isError?'#b3263c':''}
    const loginStatus=$offline('fouramiOfflineLoginStatus');
    if(loginStatus){loginStatus.textContent=message;loginStatus.style.color=isError?'#b3263c':''}
    const banner=$offline('fouramiOfflineSessionBanner');
    if(banner&&cloudSession?.offline){
      banner.classList.remove('hidden');
      const count=(fouramiOfflineData?.pendingAttempts?.length||0)+(fouramiOfflineData?.pendingSubjectProgress?.length||0);
      banner.textContent='حالت آفلاین فعال است · '+count.toLocaleString('fa-IR')+' مورد در انتظار همگام‌سازی. '+message;
    }
  }
  function loadOfflineMathBank(rows){
    const mathRows=(Array.isArray(rows)?rows:[]).filter(row=>(row.subject||'math')==='math');
    for(let c=1;c<=7;c++)practiceBank[c]=[];
    mathRows.forEach(row=>{
      const chapter=Number(row.lesson_id??row.chapter_id);
      if(chapter<1||chapter>7)return;
      if(!isCourseLessonOpen('math',chapter))return;
      practiceBank[chapter].push({id:row.id,chapter,skill:row.skill||'تمرین ریاضی',q:row.prompt,type:row.question_type||'mc',opts:Array.isArray(row.options)?row.options:[],difficulty:row.difficulty||'medium',pdfSampleSet:row.pdf_sample_set||null,why:''});
    });
    window.cloudBankRows=mathRows;
    window.__termPracticeCache={};practiceSeen.clear();updatePracticeTopicOptions();updatePracticeStats();
  }
  function getOfflineQuestionBankRows(){
    if(Array.isArray(window.cloudBankRows)&&window.cloudBankRows.length)return window.cloudBankRows;
    const rows=[];
    if(typeof practiceBank!=='undefined'&&practiceBank){
      for(let chapter=1;chapter<=7;chapter++){
        const questions=Array.isArray(practiceBank[chapter])?practiceBank[chapter]:[];
        questions.forEach(question=>{
          if(!question||typeof question!=='object')return;
          rows.push({
            id:question.id,
            subject:'math',
            lesson_id:Number(question.lesson_id??question.chapter??chapter),
            chapter_id:Number(question.chapter_id??question.chapter??chapter),
            skill:question.skill||'تمرین ریاضی',
            prompt:question.prompt??question.q??question.question??'',
            question_type:question.question_type??question.type??'mc',
            options:Array.isArray(question.options)?question.options:(Array.isArray(question.opts)?question.opts:[]),
            difficulty:question.difficulty||'medium',
            pdf_sample_set:question.pdf_sample_set??question.pdfSampleSet??null
          });
        });
      }
    }
    return rows;
  }
  async function queueMathAttempt(q,response,source,groupId,existingClientAttemptId=null){
    if(!fouramiOfflineData||!fouramiOfflineKey||fouramiOfflineData.studentId!==cloudSession?.user?.id)throw new Error('ابتدا هنگام اتصال اینترنت، حالت آفلاین را در پروفایل فعال کن.');
    const snapshot=makeQuestionSnapshot(q);
    if(!snapshot.id)throw new Error('شناسهٔ سؤال در بستهٔ آفلاین موجود نیست؛ هنگام اتصال اینترنت، بسته را به‌روزرسانی کن.');
    const attempt={
      clientAttemptId:existingClientAttemptId||crypto.randomUUID(),
      questionId:snapshot.id,
      submittedAnswer:answerForServer(q,response),
      source:/^(practice|exam):[a-z0-9:_-]{1,40}$/i.test(String(source||''))?String(source):'practice:offline',
      attemptGroup:groupId||null,
      question:snapshot,
      savedAt:new Date().toISOString()
    };
    if(!Array.isArray(fouramiOfflineData.pendingAttempts))fouramiOfflineData.pendingAttempts=[];
    fouramiOfflineData.pendingAttempts.push(attempt);
    captureCurrentSession();
    await savePackage();
    updateStatus('پاسخ تمرین به‌صورت رمزگذاری‌شده ذخیره شد.');
    return {pendingOffline:true,clientAttemptId:attempt.clientAttemptId};
  }
  async function queueSubjectProgress(payload){
    if(!fouramiOfflineData||!fouramiOfflineKey||fouramiOfflineData.studentId!==cloudSession?.user?.id) return {synced:false,reason:'offline-package-not-open'};
    if(!Array.isArray(fouramiOfflineData.pendingSubjectProgress))fouramiOfflineData.pendingSubjectProgress=[];
    const key=[payload.student_id,payload.subject,payload.lesson_id,payload.activity_key].join('|');
    const existing=fouramiOfflineData.pendingSubjectProgress.find(item=>item.key===key);
    const wrapper={queueId:existing?.queueId||crypto.randomUUID(),key,payload:fouramiClone(payload),savedAt:new Date().toISOString()};
    if(existing){const index=fouramiOfflineData.pendingSubjectProgress.indexOf(existing);fouramiOfflineData.pendingSubjectProgress[index]=wrapper}
    else fouramiOfflineData.pendingSubjectProgress.push(wrapper);
    captureCurrentSession();
    await savePackage();
    updateStatus('پیشرفت این درس به‌صورت رمزگذاری‌شده ذخیره شد.');
    return {synced:false,queued:true};
  }
  async function syncPending(){
    if(fouramiOfflineSyncInProgress||!navigator.onLine||!cloudSession?.access_token||cloudSession.profile?.role!=='student'||cloudSession.studentViewAsTeacher)return;
    if(!fouramiOfflineData||!fouramiOfflineKey||String(fouramiOfflineData.studentId)!==String(cloudSession.user?.id))return;
    fouramiOfflineSyncInProgress=true;
    try{
      if(!Array.isArray(fouramiOfflineData.pendingAttempts))fouramiOfflineData.pendingAttempts=[];
      if(!Array.isArray(fouramiOfflineData.pendingSubjectProgress))fouramiOfflineData.pendingSubjectProgress=[];
      for(const item of [...fouramiOfflineData.pendingAttempts]){
        const result=await cloudFetch('/functions/v1/submit-practice-answer',{method:'POST',body:{question_id:item.questionId,submitted_answer:item.submittedAnswer,source:item.source,attempt_group:item.attemptGroup,client_attempt_id:item.clientAttemptId}});
        if(result&&typeof result.correct==='boolean'){
          if(item.source.startsWith('exam:')&&item.attemptGroup===currentCloudAttemptGroup&&result.correct)examScore++;
          awardProgress(Number(item.question?.chapter||result.chapter_id||0),result.correct,item.question||null);
        }
        fouramiOfflineData.pendingAttempts=fouramiOfflineData.pendingAttempts.filter(saved=>saved.clientAttemptId!==item.clientAttemptId);
        captureCurrentSession();
        await savePackage();
        const stillPending=fouramiOfflineData.pendingAttempts.some(saved=>saved.attemptGroup===item.attemptGroup&&String(saved.source||'').startsWith('exam:'));
        if(item.source.startsWith('exam:')&&item.attemptGroup===currentCloudAttemptGroup&&!stillPending&&$('examResult')&&!$('examResult').classList.contains('hidden'))finishBookExam();
      }
      for(const item of [...fouramiOfflineData.pendingSubjectProgress]){
        await cloudFetch('/rest/v1/yare_subject_practice_progress?on_conflict=student_id,subject,lesson_id,activity_key',{method:'POST',body:item.payload,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
        fouramiOfflineData.pendingSubjectProgress=fouramiOfflineData.pendingSubjectProgress.filter(saved=>saved.queueId!==item.queueId);
        await savePackage();
      }
      if(fouramiOfflineData){
        captureCurrentSession();
        await savePackage();
        const count=(fouramiOfflineData.pendingAttempts?.length||0)+(fouramiOfflineData.pendingSubjectProgress?.length||0);
        if(count===0)updateStatus('همگام‌سازی کامل شد؛ پاسخ‌های ذخیره‌شده به حساب همین دانش‌آموز ارسال شدند.');
        else updateStatus('بخشی از اطلاعات هنوز در انتظار همگام‌سازی است.');
      }
    }catch(error){
      console.warn('Offline queue sync is waiting for a stable connection',error);
      updateStatus('همگام‌سازی کامل نشد؛ داده‌ها روی دستگاه باقی مانده‌اند و بعداً دوباره تلاش می‌شود.',true);
    }finally{
      fouramiOfflineSyncInProgress=false;
    }
  }
  function setupOfflinePackagePanel(){
    if($offline('fouramiOfflineProfilePanel'))return;
    const profileCard=$offline('studentProfile');
    if(!profileCard)return;
    const panel=document.createElement('section');
    panel.id='fouramiOfflineProfilePanel';panel.className='card';panel.style.marginTop='14px';
    panel.innerHTML='<h3>📴 حالت آفلاین روی همین گوشی</h3><p class="muted">در حالت آنلاین، PIN محلی بساز تا این دستگاه بستهٔ تمرین را نگه دارد. پاسخ‌های همگام‌نشده با AES-GCM رمزگذاری می‌شوند و فقط با PIN همان حساب باز می‌شوند.</p><div class="grid"><div><label class="field" for="fouramiOfflinePin">PIN آفلاین (۶ تا ۱۲ رقم)</label><input id="fouramiOfflinePin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="PIN عددی"><div id="fouramiOfflineConfirmWrap"><label class="field" for="fouramiOfflinePinConfirm">تکرار PIN</label><input id="fouramiOfflinePinConfirm" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="تکرار PIN"></div></div></div><button type="button" id="fouramiOfflineSaveButton" style="width:100%;margin-top:10px">فعال‌سازی دسترسی آفلاین</button><div id="fouramiOfflineProfileStatus" class="notice" role="status" style="margin-top:10px">برای استفادهٔ آفلاین، ابتدا بستهٔ درس و سؤال را روی همین دستگاه ذخیره کن.</div><p class="muted" style="font-size:12px">PIN فقط برای همین مرورگر است. پاک شدن داده‌های سایت یا تعویض گوشی، بستهٔ محلی را حذف می‌کند. در نسخهٔ فعلی، پنل معلم، انتشار تکلیف جدید و فایل‌های ذخیره‌شده در فضای ابری همچنان به اینترنت نیاز دارند.</p>';
    profileCard.insertAdjacentElement('afterend',panel);
    $offline('fouramiOfflinePin').addEventListener('input',e=>{e.target.value=fouramiNormalizePin(e.target.value).slice(0,12)});
    $offline('fouramiOfflinePinConfirm').addEventListener('input',e=>{e.target.value=fouramiNormalizePin(e.target.value).slice(0,12)});
    $offline('fouramiOfflineSaveButton').addEventListener('click',saveOrRefreshOfflinePackage);
  }
  async function refreshOfflineProfilePanel(){
    setupOfflinePackagePanel();
    const panel=$offline('fouramiOfflineProfilePanel');
    if(!panel)return;
    const isStudent=cloudSession?.profile?.role==='student'&&!cloudSession.studentViewAsTeacher;
    panel.classList.toggle('hidden',!isStudent);
    if(!isStudent)return;
    const existing=await readPackageByStudent(cloudSession.profile.id).catch(()=>null);
    const confirmWrap=$offline('fouramiOfflineConfirmWrap');
    const button=$offline('fouramiOfflineSaveButton');
    const pinLabel=panel.querySelector('label[for="fouramiOfflinePin"]');
    if(existing){
      confirmWrap.classList.add('hidden');
      if(pinLabel)pinLabel.textContent='PIN فعلی بستهٔ آفلاین';
      button.textContent='بازکردن بسته، همگام‌سازی و به‌روزرسانی';
      updateStatus('بستهٔ آفلاین این دانش‌آموز روی این گوشی وجود دارد؛ برای همگام‌سازی، PIN فعلی را وارد کن.');
    }else{
      confirmWrap.classList.remove('hidden');
      if(pinLabel)pinLabel.textContent='PIN آفلاین جدید (۶ تا ۱۲ رقم)';
      button.textContent='فعال‌سازی دسترسی آفلاین';
    }
  }
  async function saveOrRefreshOfflinePackage(){
    const status=$offline('fouramiOfflineProfileStatus');
    try{
      if(!navigator.onLine)throw new Error('برای ساخت یا به‌روزرسانی بسته، ابتدا اینترنت را وصل کن.');
      if(!cloudSession?.access_token||cloudSession.profile?.role!=='student'||cloudSession.studentViewAsTeacher)throw new Error('این قابلیت فقط برای حساب دانش‌آموز در دسترس است.');
      const pin=fouramiNormalizePin($offline('fouramiOfflinePin')?.value);
      if(!/^\d{6,12}$/.test(pin))throw new Error('PIN باید ۶ تا ۱۲ رقم باشد.');
      const studentId=String(cloudSession.profile.id);
      const legacyOtherProgress=(()=>{try{return JSON.parse(localStorage.getItem(otherProgressKey())||'{}')}catch{return {}}})();
      const existing=await readPackageByStudent(studentId);
      if(existing){
        let opened;
        try{opened=await decryptPackage(existing,pin)}catch{throw new Error('PIN فعلی درست نیست یا بستهٔ آفلاین قابل باز کردن نیست؛ برای حفظ پاسخ‌های ذخیره‌شده چیزی بازنویسی نشد.')}
        fouramiOfflineData=opened.data;fouramiOfflineKey=opened.key;fouramiOfflineSalt=opened.salt;fouramiOfflineRecord={...existing,failedAttempts:0,lockUntil:0};
        if(String(fouramiOfflineData.studentId)!==studentId)throw new Error('این بسته متعلق به حساب دیگری است.');
      }else{
        const confirmation=fouramiNormalizePin($offline('fouramiOfflinePinConfirm')?.value);
        if(pin!==confirmation)throw new Error('دو بار وارد کردن PIN یکسان نیست.');
        const salt=crypto.getRandomValues(new Uint8Array(16));
        fouramiOfflineSalt=salt;fouramiOfflineKey=await deriveOfflineKey(pin,salt);
        fouramiOfflineRecord={studentId,username:fouramiNormalizeUsername(cloudSession.username||activeUsername),salt:bytesToBase64(salt),iv:'',ciphertext:'',failedAttempts:0,lockUntil:0,updatedAt:new Date().toISOString()};
        fouramiOfflineData={version:1,studentId,username:cloudSession.username||activeUsername,profile:fouramiClone(cloudSession.profile),session:{},courseSettings:{},questionBank:[],studentProgress:defaultProgress(),otherProgress:{},pendingAttempts:[],pendingSubjectProgress:[],createdAt:new Date().toISOString()};
      }
      const availableQuestionBank=getOfflineQuestionBankRows();
      if(!availableQuestionBank.length&&!(Array.isArray(fouramiOfflineData.questionBank)&&fouramiOfflineData.questionBank.length)){
        throw new Error('بانک سؤال هنوز بارگیری نشده است. یک‌بار از حساب دانش‌آموز آنلاین وارد شو، کمی صبر کن تا بارگیری کامل شود و دوباره تلاش کن.');
      }
      fouramiOfflineData.version=1;fouramiOfflineData.studentId=studentId;fouramiOfflineData.username=cloudSession.username||activeUsername;
      fouramiOfflineData.profile=fouramiClone(cloudSession.profile);
      fouramiOfflineData.courseSettings=fouramiClone(courseSettingsBySubject||{});
      fouramiOfflineData.questionBank=fouramiClone(availableQuestionBank.length?availableQuestionBank:fouramiOfflineData.questionBank);
      fouramiOfflineData.studentProgress=fouramiClone(studentProgress||defaultProgress());
      fouramiOfflineData.otherProgress=fouramiMergeOtherProgress(fouramiOfflineData.otherProgress,legacyOtherProgress);
      if(!Array.isArray(fouramiOfflineData.pendingAttempts))fouramiOfflineData.pendingAttempts=[];
      if(!Array.isArray(fouramiOfflineData.pendingSubjectProgress))fouramiOfflineData.pendingSubjectProgress=[];
      captureCurrentSession();
      fouramiOfflineRecord.failedAttempts=0;fouramiOfflineRecord.lockUntil=0;
      await savePackage();
      $offline('fouramiOfflinePin').value='';$offline('fouramiOfflinePinConfirm').value='';
      await refreshOfflineProfilePanel();
      updateStatus('دسترسی آفلاین آماده شد. اکنون می‌توانی این گوشی را بدون اینترنت هم برای تمرین‌های ذخیره‌شده استفاده کنی.');
      if(navigator.onLine)await syncPending();
    }catch(error){if(status){status.textContent=error.message||'فعال‌سازی حالت آفلاین ناموفق بود.';status.style.color='#b3263c'}}
  }
  async function loginWithOfflinePin(){
    const status=$offline('fouramiOfflineLoginStatus');
    try{
      const username=String($offline('fouramiOfflineUsernameInput')?.value||'').trim();
      const pin=fouramiNormalizePin($offline('fouramiOfflinePinLogin')?.value);
      if(!username)throw new Error('ابتدا نام کاربری دانش‌آموز را وارد کن.');
      if(!/^\d{6,12}$/.test(pin))throw new Error('PIN باید ۶ تا ۱۲ رقم باشد.');
      const record=await readPackageByUsername(username);
      if(!record)throw new Error('برای این نام کاربری، هنوز روی همین گوشی دسترسی آفلاین فعال نشده است. ابتدا آنلاین وارد شو و از پروفایل فعالش کن.');
      if(record.lockUntil&&record.lockUntil>Date.now())throw new Error('پس از چند تلاش ناموفق، ورود موقتاً قفل شده است. کمی بعد دوباره امتحان کن.');
      let opened;
      try{opened=await decryptPackage(record,pin)}catch(error){
        record.failedAttempts=(Number(record.failedAttempts)||0)+1;
        if(record.failedAttempts>=5){record.failedAttempts=0;record.lockUntil=Date.now()+60000}
        await writePackage(record).catch(()=>{});
        throw error.message?.includes('موقتاً قفل')?error:new Error('PIN نادرست است یا بستهٔ آفلاین آسیب دیده است.');
      }
      if(opened.data.profile?.role!=='student'||String(opened.data.profile.id)!==String(record.studentId))throw new Error('این بسته برای ورود دانش‌آموزی معتبر نیست.');
      fouramiOfflineData=opened.data;fouramiOfflineKey=opened.key;fouramiOfflineSalt=opened.salt;fouramiOfflineRecord={...record,failedAttempts:0,lockUntil:0};
      cloudSession={access_token:opened.data.session?.access_token||'',refresh_token:opened.data.session?.refresh_token||'',user:opened.data.session?.user||{id:record.studentId},role:'student',profile:fouramiClone(opened.data.profile),username:opened.data.username||username,offline:true,studentViewAsTeacher:false};
      try{sessionStorage.removeItem(CLOUD_SESSION_KEY)}catch{}
      activeStudentName=opened.data.username||username;activeUsername=activeStudentName;
      activeProfile={...readProfile(activeStudentName),name:cloudSession.profile.display_name||activeStudentName,nickname:cloudSession.profile.nickname||'',favorite:cloudSession.profile.favorite_skill||''};
      studentProgress=fouramiClone(opened.data.studentProgress||defaultProgress());
      courseSettingsBySubject=fouramiClone(opened.data.courseSettings||{});
      window.cloudBankRows=fouramiClone(opened.data.questionBank||[]);
      loadOfflineMathBank(window.cloudBankRows);
      renderStudentDashboard();
      $offline('studentPasswordInput').value='';$offline('fouramiOfflinePinLogin').value='';
      if($offline('fouramiOfflineProfilePanel'))$offline('fouramiOfflineProfilePanel').classList.add('hidden');
      const banner=$offline('fouramiOfflineSessionBanner');if(banner)banner.classList.remove('hidden');
      show('student');showStudentAppView('home');yareAppPushStudentRootHistory();
      updateStatus('با PIN محلی وارد شدی. پاسخ‌های تمرین ریاضی تا زمان اتصال بررسی نمی‌شوند؛ سایر تمرین‌های ثابت می‌توانند محلی تصحیح شوند.');
      if(navigator.onLine)void syncPending();
    }catch(error){if(status){status.textContent=error.message||'ورود آفلاین ناموفق بود.';status.style.color='#b3263c'}}
  }

  function getLoginFieldNodes(inputId){
    const input=$offline(inputId);
    if(!input)return [];
    const label=document.querySelector('label[for="'+inputId+'"]');
    const holder=input.parentElement;
    if(holder&&holder.querySelectorAll('input').length===1&&(!label||holder.contains(label)))return [holder];
    return [label,input].filter(Boolean);
  }
  function moveLoginField(inputId,target){
    const input=$offline(inputId);
    if(!input)return;
    const label=document.querySelector('label[for="'+inputId+'"]');
    const holder=input.parentElement;
    const nodes=holder&&holder.querySelectorAll('input').length===1&&(!label||holder.contains(label))?[holder]:[label,input].filter(Boolean);
    nodes.forEach(node=>target.appendChild(node));
  }
  function setupUnifiedStudentLogin(panel){
    if($offline('fouramiUnifiedStudentLogin'))return;
    const username=$offline('studentNameInput');
    const password=$offline('studentPasswordInput');
    const onlineButton=$offline('studentLoginConfirm');
    if(!username||!password||!onlineButton||!panel)return;
    let host=username.parentElement;
    while(host&&host!==document.body&&!(host.contains(password)&&host.contains(onlineButton)))host=host.parentElement;
    if(!host||host===document.body)return;
    const usernameNodes=getLoginFieldNodes('studentNameInput');
    const anchor=usernameNodes[0]||username;
    let insertBefore=anchor;
    while(insertBefore.parentElement&&insertBefore.parentElement!==host)insertBefore=insertBefore.parentElement;
    const oldParents=[...new Set([
      username.parentElement,password.parentElement,onlineButton.parentElement,
      document.querySelector('label[for="studentNameInput"]')?.parentElement,
      document.querySelector('label[for="studentPasswordInput"]')?.parentElement
    ])];
    const layout=document.createElement('section');
    layout.id='fouramiUnifiedStudentLogin';
    layout.setAttribute('aria-label','ورود دانش‌آموز');
    layout.style.cssText='display:block;width:100%;box-sizing:border-box;margin:0;grid-column:1/-1;';
    const columns=document.createElement('div');
    columns.id='fouramiUnifiedLoginColumns';
    columns.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;width:100%;min-width:0;box-sizing:border-box;';
    const onlineColumn=document.createElement('section');
    onlineColumn.className='item';
    onlineColumn.style.cssText='margin:0;padding:10px;min-width:0;box-sizing:border-box;height:100%;';
    const onlineTitle=document.createElement('h3');
    onlineTitle.textContent='🌐 ورود آنلاین';
    onlineTitle.style.cssText='font-size:14px;margin:0 0 8px;';
    onlineColumn.appendChild(onlineTitle);
    const offlineDescription=panel.querySelector('h3 + p');
    if(offlineDescription){offlineDescription.textContent='نام کاربری و PIN این دستگاه را وارد کن.';offlineDescription.style.cssText='font-size:10px;line-height:1.3;margin:0 0 6px;';}
    const offlineTitle=panel.querySelector('h3');
    if(offlineTitle){offlineTitle.textContent='📴 ورود آفلاین';offlineTitle.style.cssText='font-size:14px;margin:0 0 8px;'}
    panel.classList.add('fourami-login-offline-column');
    panel.style.cssText='margin:0;padding:10px;min-width:0;box-sizing:border-box;height:100%;';
    if(!$offline('fouramiOfflineUsernameInput')){
      const offlineUsernameLabel=document.createElement('label');
      offlineUsernameLabel.className='field';
      offlineUsernameLabel.htmlFor='fouramiOfflineUsernameInput';
      offlineUsernameLabel.textContent='نام کاربری آفلاین';
      offlineUsernameLabel.style.cssText='display:block;font-size:12px;margin:0 0 5px;';
      const offlineUsername=document.createElement('input');
      offlineUsername.id='fouramiOfflineUsernameInput';
      offlineUsername.type='text';
      offlineUsername.autocomplete='username';
      offlineUsername.inputMode='text';
      offlineUsername.placeholder='نام کاربری دانش‌آموز';
      offlineUsername.style.cssText='display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;';
      const pinLabel=panel.querySelector('label[for="fouramiOfflinePinLogin"]');
      panel.insertBefore(offlineUsernameLabel,pinLabel||panel.firstChild);
      panel.insertBefore(offlineUsername, pinLabel||panel.firstChild);
    }
    const offlineUsername=$offline('fouramiOfflineUsernameInput');
    if(offlineUsername)offlineUsername.style.cssText='display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin:0 0 8px;';
    const offlinePinLabel=panel.querySelector('label[for="fouramiOfflinePinLogin"]');
    const offlinePin=panel.querySelector('#fouramiOfflinePinLogin');
    const offlineButton=panel.querySelector('#fouramiOfflineLoginButton');
    if(offlinePinLabel)offlinePinLabel.style.cssText='display:block;font-size:12px;margin:0 0 5px;';
    if(offlinePin)offlinePin.style.cssText='display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;';
    if(offlineButton){offlineButton.textContent='ورود آفلاین';offlineButton.style.cssText='display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:8px 4px;font-size:12px;white-space:normal;';}
    const offlineStatus=$offline('fouramiOfflineLoginStatus');
    if(offlineStatus)offlineStatus.style.cssText='font-size:11px;overflow-wrap:anywhere;margin:6px 0 0;';
    const usernameLabel=document.querySelector('label[for="studentNameInput"]');
    if(usernameLabel)usernameLabel.style.cssText='display:block;margin:0 0 5px;';
    username.style.cssText='display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;';
    const passwordLabel=document.querySelector('label[for="studentPasswordInput"]');
    if(passwordLabel)passwordLabel.style.cssText='display:block;margin:0 0 5px;';
    password.style.cssText='display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;';
    onlineButton.style.cssText='display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:8px 4px;font-size:12px;white-space:normal;';
    const assetStatus=document.createElement('p');
    assetStatus.id='fouramiOfflineAssetsStatus';
    assetStatus.className='muted';
    assetStatus.setAttribute('role','status');
    assetStatus.style.cssText='font-size:11px;line-height:1.4;margin:8px 0 0;overflow-wrap:anywhere;';
    assetStatus.textContent='هنگام استفادهٔ آنلاین، تصاویر کتاب‌ها به‌تدریج برای استفادهٔ آفلاین ذخیره می‌شوند.';
    layout.append(columns,assetStatus);
    columns.append(onlineColumn,panel);
    if(insertBefore.parentElement===host)host.insertBefore(layout,insertBefore);
    else host.prepend(layout);
    moveLoginField('studentNameInput',onlineColumn);
    moveLoginField('studentPasswordInput',onlineColumn);
    onlineColumn.appendChild(onlineButton);
    const onlineStatus=$offline('studentLoginStatus')||$offline('studentLoginError');
    if(onlineStatus&&!layout.contains(onlineStatus)&&host.contains(onlineStatus))onlineColumn.appendChild(onlineStatus);
    for(const oldParent of oldParents){
      if(!oldParent||oldParent===host||layout.contains(oldParent)||!oldParent.isConnected)continue;
      if(!oldParent.querySelector('input,button,select,textarea')&&!oldParent.textContent.trim()&&!oldParent.children.length)oldParent.remove();
    }
  }
  function updateOfflineAssetsStatus(message,isError=false){
    const status=$offline('fouramiOfflineAssetsStatus');
    if(!status)return;
    status.textContent=message;
    status.style.color=isError?'#b3263c':'';
  }
  async function preloadOfflineBookAssets(){
    if(!navigator.onLine||!('caches' in window)||fouramiOfflineAssetPreloadPromise)return fouramiOfflineAssetPreloadPromise;
    fouramiOfflineAssetPreloadPromise=(async()=>{
      try{if(navigator.storage&&typeof navigator.storage.persist==='function')await navigator.storage.persist()}catch{}
      const cache=await caches.open(FOURAMI_OFFLINE_BOOK_CACHE);
      const readyUrl=new URL('./fourami-offline-assets-ready-v1',document.baseURI).href;
      if(await cache.match(readyUrl)){
        updateOfflineAssetsStatus('تصاویر کتاب‌ها و فایل‌های لازم از قبل ذخیره شده‌اند و آمادهٔ استفادهٔ آفلاین هستند.');
        return {total:0,failed:0,cached:true};
      }
      updateOfflineAssetsStatus('در حال بررسی صفحات کتاب‌ها برای ذخیرهٔ آفلاین…');
      const paths=new Set([
        './manifest.webmanifest',
        './icons/app-icon-2.png',
        './assets/source-question-banks.json.gz.b64',
        './assets/persian-vocabulary.json.gz.b64',
        './assets/math-fourth.pdf',
        './assets/books/persian-pages.pdf'
      ]);
      const manifestFailures=[];
      for(const subject of FOURAMI_BOOK_SUBJECTS){
        const relative='./assets/book-pages/'+subject+'/page-map.json';
        const url=new URL(relative,document.baseURI).href;
        try{
          let response=await cache.match(url);
          if(!response){
            response=await fetch(url);
            if(!response.ok)throw new Error('HTTP '+response.status);
            await cache.put(url,response.clone());
          }
          const manifest=await response.json();
          const lessons=manifest&&manifest.lessons&&typeof manifest.lessons==='object'?Object.values(manifest.lessons):Object.values(manifest||{}).filter(value=>value&&typeof value==='object'&&('printedStart' in value)&&('printedEnd' in value));
          const pages=new Set();
          for(const lesson of lessons){
            const first=Number(lesson?.printedStart),last=Number(lesson?.printedEnd);
            if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last>999)continue;
            for(let page=first;page<=last;page++)pages.add(page);
          }
          paths.add(relative);
          for(const page of pages)paths.add('./assets/book-pages/'+subject+'/page-'+String(page).padStart(3,'0')+'.webp');
        }catch(error){
          manifestFailures.push(relative);
          console.warn('Could not prepare offline textbook manifest',subject,error);
        }
      }
      const urls=[...paths].map(path=>new URL(path,document.baseURI).href);
      let next=0,completed=0;
      const failed=[];
      const worker=async()=>{
        while(true){
          const index=next++;
          if(index>=urls.length)return;
          const url=urls[index];
          try{
            let response=await cache.match(url);
            if(!response){
              let lastError=null;
              for(let attempt=0;attempt<3&&!response;attempt++){
                try{
                  const fetched=await fetch(url);
                  if(!fetched.ok)throw new Error('HTTP '+fetched.status);
                  response=fetched;
                }catch(error){
                  lastError=error;
                  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
                }
              }
              if(!response)throw lastError||new Error('Network request failed');
              await cache.put(url,response.clone());
            }
          }catch(error){
            failed.push(url);
            console.warn('Could not cache offline textbook asset',url,error);
          }
          completed++;
          if(completed===urls.length||completed%6===0){
            updateOfflineAssetsStatus('در حال ذخیرهٔ صفحه‌ها و فایل‌های کتاب برای استفادهٔ آفلاین: '+completed.toLocaleString('fa-IR')+' از '+urls.length.toLocaleString('fa-IR'));
          }
          await new Promise(resolve=>setTimeout(resolve,90));
        }
      };
      updateOfflineAssetsStatus('در حال آماده‌سازی صفحه‌های کتاب برای آفلاین… بارگیری اولیه حدود ۶۰ مگابایت است.');
      await Promise.all(Array.from({length:2},()=>worker()));
      const failures=[...new Set([...manifestFailures.map(path=>new URL(path,document.baseURI).href),...failed])];
      if(failures.length){
        updateOfflineAssetsStatus('ذخیرهٔ آفلاین کامل نشد؛ '+failures.length.toLocaleString('fa-IR')+' فایل باقی مانده است. با اتصال اینترنت دوباره تلاش می‌شود.',true);
      }else{
        await cache.put(readyUrl,new Response(JSON.stringify({savedAt:new Date().toISOString(),assetCount:urls.length}),{headers:{'Content-Type':'application/json'}}));
        updateOfflineAssetsStatus('آماده شد؛ تصاویر صفحات شش کتاب و فایل‌های لازم روی این دستگاه ذخیره شدند. برای آماده‌سازی اولیه حدود ۶۰ مگابایت اینترنت مصرف می‌شود.');
      }
      return {total:urls.length,failed:failures.length};
    })().catch(error=>{
      updateOfflineAssetsStatus('ذخیرهٔ آفلاین فعلاً انجام نشد؛ اتصال اینترنت را بررسی کن و دوباره برنامه را باز کن.',true);
      console.warn('Offline textbook preloading failed',error);
      return {total:0,failed:1};
    }).finally(()=>{fouramiOfflineAssetPreloadPromise=null});
    return fouramiOfflineAssetPreloadPromise;
  }

  function addOfflineLoginUi(){
    const onlineButton=$offline('studentLoginConfirm');
    if(!onlineButton||$offline('fouramiOfflineLoginPanel'))return;
    const panel=document.createElement('section');panel.id='fouramiOfflineLoginPanel';panel.className='item';panel.style.marginTop='12px';
    panel.innerHTML='<h3 style="margin-top:0">📴 ورود بدون اینترنت</h3><p class="muted">فقط برای حسابی که قبلاً روی همین گوشی حالت آفلاین آن فعال شده است.</p><label class="field" for="fouramiOfflinePinLogin">PIN آفلاین</label><input id="fouramiOfflinePinLogin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="PIN عددی"><button type="button" id="fouramiOfflineLoginButton" class="outline" style="width:100%;margin-top:10px">ورود با PIN آفلاین</button><p id="fouramiOfflineLoginStatus" class="muted" role="status"></p>';
    onlineButton.insertAdjacentElement('afterend',panel);
    $offline('fouramiOfflinePinLogin').addEventListener('input',e=>{e.target.value=fouramiNormalizePin(e.target.value).slice(0,12)});
    $offline('fouramiOfflineLoginButton').addEventListener('click',loginWithOfflinePin);
    setupUnifiedStudentLogin(panel);
  }
  function addOfflineSessionBanner(){
    if($offline('fouramiOfflineSessionBanner'))return;
    const identity=$offline('student')?.querySelector('.student-identity-card');
    if(!identity)return;
    const banner=document.createElement('div');banner.id='fouramiOfflineSessionBanner';banner.className='notice hidden';banner.setAttribute('role','status');banner.style.margin='10px 0';
    banner.textContent='حالت آفلاین فعال است.';
    identity.insertAdjacentElement('afterend',banner);
  }
  function resetUnlockedPackage(){
    fouramiOfflineData=null;fouramiOfflineKey=null;fouramiOfflineSalt=null;fouramiOfflineRecord=null;
    const banner=$offline('fouramiOfflineSessionBanner');if(banner)banner.classList.add('hidden');
  }
  function init(){
    addOfflineLoginUi();addOfflineSessionBanner();setupOfflinePackagePanel();
    if(navigator.onLine)void preloadOfflineBookAssets();
    const profileNav=document.querySelector('[data-app-view="profile"]');
    if(profileNav)profileNav.addEventListener('click',()=>setTimeout(()=>{void refreshOfflineProfilePanel()},0));
    const studentEnter=$offline('studentEnter');
    if(studentEnter)studentEnter.addEventListener('click',()=>{if($offline('fouramiOfflinePinLogin'))$offline('fouramiOfflinePinLogin').value='';if($offline('fouramiOfflineLoginStatus'))$offline('fouramiOfflineLoginStatus').textContent=''});
    const originalStudentBack=$offline('studentBack')?.onclick;
    if($offline('studentBack'))$offline('studentBack').onclick=function(){
      if(cloudSession?.offline){
        resetUnlockedPackage();cloudSession=null;
        activeStudentName='';activeUsername='';activeProfile={};studentProgress=defaultProgress();
        practiceAsked=0;practiceCorrect=0;practiceSeen.clear();currentPractice=null;selectedPracticeAnswer=null;practiceWasChecked=false;
        examItems=[];examIndex=0;examScore=0;examSelectedAnswer=null;examAnswered=false;currentCloudAttemptGroup=null;
        show('home');
        if($offline('studentNameInput'))$offline('studentNameInput').value='';
        if($offline('fouramiOfflineUsernameInput'))$offline('fouramiOfflineUsernameInput').value='';
        if($offline('fouramiOfflinePinLogin'))$offline('fouramiOfflinePinLogin').value='';
        return;
      }
      if(originalStudentBack)originalStudentBack.call(this);
    };
    window.addEventListener('online',()=>{if(fouramiOfflineData&&cloudSession?.profile?.role==='student')void syncPending();void preloadOfflineBookAssets()});
    window.addEventListener('focus',()=>{if(fouramiOfflineData&&cloudSession?.profile?.role==='student'&&navigator.onLine)void syncPending();if(navigator.onLine)void preloadOfflineBookAssets()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine)void preloadOfflineBookAssets()});
  }
  window.__fouramiOfflineMode={
    sync:syncPending,refreshProfile:refreshOfflineProfilePanel,savePackage,captureCurrentSession,
    queueMathAttempt,queueSubjectProgress,clearIfDifferent,resetUnlockedPackage
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
