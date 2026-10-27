
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
  let fouramiOfflineLoginInProgress=false;
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
    panel.innerHTML='<h3>📴 ورود آفلاین با رمز حساب</h3><p class="muted">برای آماده‌کردن همین گوشی، رمز عبور فعلی حساب دانش‌آموز را وارد کن. رمز به‌صورت متن ساده ذخیره نمی‌شود؛ بستهٔ آفلاین با کلید رمزنگاری‌شده روی همین دستگاه نگهداری می‌شود.</p><label class="field" for="fouramiOfflinePin">رمز عبور حساب دانش‌آموز</label><input id="fouramiOfflinePin" type="password" autocomplete="current-password" maxlength="128" placeholder="همان رمز ورود دانش‌آموز"><div id="fouramiOfflineConfirmWrap"><label class="field" for="fouramiOfflinePinConfirm">تکرار رمز عبور حساب</label><input id="fouramiOfflinePinConfirm" type="password" autocomplete="new-password" maxlength="128" placeholder="تکرار همان رمز عبور"></div><div id="fouramiOfflineLegacyPinWrap" class="hidden"><label class="field" for="fouramiOfflineLegacyPin">رمز یا PIN قبلی بستهٔ آفلاین</label><input id="fouramiOfflineLegacyPin" type="password" autocomplete="off" maxlength="128" placeholder="فقط برای انتقال یک‌بارهٔ بستهٔ قدیمی"><p class="muted" style="font-size:12px">این فیلد فقط برای انتقال بسته‌ای است که قبلاً با PIN جداگانه ساخته شده؛ پس از انتقال، ورود آفلاین با رمز حساب انجام می‌شود.</p></div><button type="button" id="fouramiOfflineSaveButton" style="width:100%;margin-top:10px">فعال‌سازی ورود آفلاین</button><div id="fouramiOfflineProfileStatus" class="notice" role="status" style="margin-top:10px">برای استفادهٔ آفلاین، بستهٔ درس و سؤال را روی همین دستگاه آماده کن.</div><p class="muted" style="font-size:12px">این بسته فقط روی همین مرورگر و دستگاه در دسترس است. اگر داده‌های سایت پاک شوند یا دستگاه عوض شود، باید هنگام اتصال اینترنت دوباره آماده شود. تصاویر و فایل‌های کتاب در حالت آفلاین در دسترس نیستند؛ آموزش‌ها، تمرین‌ها و آزمون‌های ذخیره‌شده فعال می‌مانند.</p>';
    profileCard.insertAdjacentElement('afterend',panel);
    for(const id of ['fouramiOfflinePin','fouramiOfflinePinConfirm','fouramiOfflineLegacyPin']){
      $offline(id).addEventListener('input',e=>{e.target.value=String(e.target.value||'').slice(0,128)});
    }
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
    const legacyWrap=$offline('fouramiOfflineLegacyPinWrap');
    const button=$offline('fouramiOfflineSaveButton');
    const label=panel.querySelector('label[for="fouramiOfflinePin"]');
    if(legacyWrap)legacyWrap.classList.add('hidden');
    if(existing){
      confirmWrap.classList.add('hidden');
      if(label)label.textContent='رمز عبور فعلی حساب دانش‌آموز';
      button.textContent='بازکردن، انتقال یا به‌روزرسانی بستهٔ آفلاین';
      updateStatus('این دستگاه قبلاً بستهٔ آفلاین دارد؛ رمز حساب را وارد کن. اگر بسته با PIN قدیمی ساخته شده باشد، فقط برای انتقال یک‌باره، PIN یا رمز قبلی هم لازم می‌شود.');
    }else{
      confirmWrap.classList.remove('hidden');
      if(label)label.textContent='رمز عبور حساب دانش‌آموز';
      button.textContent='فعال‌سازی ورود آفلاین';
    }
  }
  async function saveOrRefreshOfflinePackage(){
    const status=$offline('fouramiOfflineProfileStatus');
    try{
      if(!navigator.onLine)throw new Error('برای آماده‌سازی یا به‌روزرسانی بسته، ابتدا اینترنت را وصل کن.');
      if(!cloudSession?.access_token||cloudSession.profile?.role!=='student'||cloudSession.studentViewAsTeacher)throw new Error('این قابلیت فقط برای حساب دانش‌آموز در دسترس است.');
      const password=String($offline('fouramiOfflinePin')?.value||'');
      if(!password)throw new Error('رمز عبور فعلی حساب دانش‌آموز را وارد کن.');
      const studentId=String(cloudSession.profile.id);
      const legacyOtherProgress=(()=>{try{return JSON.parse(localStorage.getItem(otherProgressKey())||'{}')}catch{return {}}})();
      const existing=await readPackageByStudent(studentId);
      let migratedLegacyPackage=false;
      if(existing){
        let opened;
        try{
          opened=await decryptPackage(existing,password);
        }catch(passwordError){
          const legacyPassword=String($offline('fouramiOfflineLegacyPin')?.value||'');
          if(!legacyPassword){
            const legacyWrap=$offline('fouramiOfflineLegacyPinWrap');
            if(legacyWrap)legacyWrap.classList.remove('hidden');
            throw new Error('رمز حساب نتوانست بستهٔ قبلی را باز کند. اگر این بسته قبلاً با PIN جداگانه ساخته شده بود، PIN یا رمز قبلی را در بخش انتقال وارد کن و دوباره بزن.');
          }
          try{opened=await decryptPackage(existing,legacyPassword);migratedLegacyPackage=true}
          catch{throw new Error('رمز حساب و PIN یا رمز قبلی نتوانستند بسته را باز کنند؛ برای حفظ پاسخ‌های ذخیره‌شده، بسته بازنویسی نشد.')}
        }
        fouramiOfflineData=opened.data;
        fouramiOfflineSalt=opened.salt;
        if(migratedLegacyPackage){
          fouramiOfflineSalt=crypto.getRandomValues(new Uint8Array(16));
          fouramiOfflineKey=await deriveOfflineKey(password,fouramiOfflineSalt);
          fouramiOfflineRecord={...existing,salt:bytesToBase64(fouramiOfflineSalt),iv:'',ciphertext:'',failedAttempts:0,lockUntil:0};
        }else{
          fouramiOfflineKey=opened.key;
          fouramiOfflineRecord={...existing,failedAttempts:0,lockUntil:0};
        }
        if(String(fouramiOfflineData.studentId)!==studentId)throw new Error('این بسته متعلق به حساب دیگری است.');
      }else{
        const confirmation=String($offline('fouramiOfflinePinConfirm')?.value||'');
        if(password!==confirmation)throw new Error('رمز عبور و تکرار آن یکسان نیستند.');
        const salt=crypto.getRandomValues(new Uint8Array(16));
        fouramiOfflineSalt=salt;
        fouramiOfflineKey=await deriveOfflineKey(password,salt);
        fouramiOfflineRecord={studentId,username:fouramiNormalizeUsername(cloudSession.username||activeUsername),salt:bytesToBase64(salt),iv:'',ciphertext:'',failedAttempts:0,lockUntil:0,updatedAt:new Date().toISOString()};
        fouramiOfflineData={version:1,studentId,username:cloudSession.username||activeUsername,profile:fouramiClone(cloudSession.profile),session:{},courseSettings:{},questionBank:[],studentProgress:defaultProgress(),otherProgress:{},pendingAttempts:[],pendingSubjectProgress:[],createdAt:new Date().toISOString()};
      }
      const availableQuestionBank=getOfflineQuestionBankRows();
      if(!availableQuestionBank.length&&!(Array.isArray(fouramiOfflineData.questionBank)&&fouramiOfflineData.questionBank.length)){
        throw new Error('بانک سؤال هنوز بارگیری نشده است. یک‌بار آنلاین وارد شو، صبر کن تا بارگیری کامل شود و دوباره تلاش کن.');
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
      $offline('fouramiOfflinePin').value='';
      $offline('fouramiOfflinePinConfirm').value='';
      $offline('fouramiOfflineLegacyPin').value='';
      if($offline('fouramiOfflineLegacyPinWrap'))$offline('fouramiOfflineLegacyPinWrap').classList.add('hidden');
      await refreshOfflineProfilePanel();
      updateStatus('ورود آفلاین با همان نام کاربری و رمز حساب آماده شد. این بسته فقط روی همین دستگاه ذخیره شده است.');
      if(navigator.onLine)await syncPending();
    }catch(error){if(status){status.textContent=error.message||'آماده‌سازی حالت آفلاین ناموفق بود.';status.style.color='#b3263c'}}
  }
  async function loginWithOfflinePin(){
    const status=$offline('fouramiOfflineLoginStatus');
    if(fouramiOfflineLoginInProgress)return;
    fouramiOfflineLoginInProgress=true;
    try{
      const username=String($offline('studentNameInput')?.value||'').trim();
      const password=String($offline('studentPasswordInput')?.value||'');
      if(!username)throw new Error('نام کاربری دانش‌آموز را وارد کن.');
      if(!password)throw new Error('رمز عبور حساب را وارد کن.');
      const record=await readPackageByUsername(username);
      if(!record)throw new Error('برای این نام کاربری هنوز روی همین گوشی بستهٔ آفلاین آماده نشده است. یک‌بار آنلاین وارد شو و از پروفایل آن را فعال کن.');
      if(record.lockUntil&&record.lockUntil>Date.now())throw new Error('پس از چند تلاش ناموفق، ورود موقتاً قفل شده است. کمی بعد دوباره امتحان کن.');
      let opened;
      try{opened=await decryptPackage(record,password)}catch(error){
        record.failedAttempts=(Number(record.failedAttempts)||0)+1;
        if(record.failedAttempts>=5){record.failedAttempts=0;record.lockUntil=Date.now()+60000}
        await writePackage(record).catch(()=>{});
        throw error.message?.includes('موقتاً قفل')?error:new Error('رمز عبور نادرست است یا بستهٔ آفلاین با این رمز آماده نشده است.');
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
      $offline('studentPasswordInput').value='';
      const onlineError=$offline('studentLoginError');if(onlineError)onlineError.classList.add('hidden');
      if(status)status.textContent='';
      if($offline('fouramiOfflineProfilePanel'))$offline('fouramiOfflineProfilePanel').classList.add('hidden');
      const banner=$offline('fouramiOfflineSessionBanner');if(banner)banner.classList.remove('hidden');
      show('student');showStudentAppView('home');yareAppPushStudentRootHistory();
      updateStatus('با همان نام کاربری و رمز عبور وارد شدی. تصاویر و فایل‌های کتاب آفلاین نیستند؛ آموزش‌ها، تمرین‌ها و آزمون‌های ذخیره‌شده فعال‌اند.');
      if(navigator.onLine)void syncPending();
    }catch(error){
      if(status){status.textContent=error.message||'ورود ناموفق بود.';status.style.color='#b3263c'}
    }finally{fouramiOfflineLoginInProgress=false}
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
    if(!input)return null;
    const label=document.querySelector('label[for="'+inputId+'"]');
    const group=document.createElement('div');
    group.className='fourami-login-field-group';
    group.style.cssText='display:flex;flex-direction:column;gap:5px;min-width:0;width:100%;box-sizing:border-box;margin:0 0 9px;';
    if(label){
      if(inputId==='studentNameInput')label.textContent='نام کاربری';
      label.style.cssText='display:block;min-height:18px;line-height:18px;margin:0;font-size:12px;';
      group.appendChild(label);
    }
    group.appendChild(input);
    if(inputId==='studentNameInput')input.placeholder='نام کاربری';
    input.style.cssText='display:block;width:100%;height:38px;max-width:100%;min-width:0;box-sizing:border-box;margin:0;';
    target.appendChild(group);
    return group;
  }
  function setupUnifiedStudentLogin(panel){
    if(!panel||$offline('fouramiUnifiedStudentLogin'))return;
    panel.id='fouramiUnifiedStudentLoginNote';
    panel.className='notice';
    panel.style.cssText='display:block;width:100%;box-sizing:border-box;margin:10px 0 0;padding:9px 11px;font-size:12px;line-height:1.5;';
    panel.innerHTML='<p style="margin:0">از همین نام کاربری و رمز عبور برای ورود استفاده کن. اگر اینترنت در دسترس نباشد، این اطلاعات روی دستگاهی که قبلاً برای دانش‌آموز آماده شده، ورود آفلاین را انجام می‌دهد. در حالت آفلاین تصاویر و فایل‌های کتاب در دسترس نیستند؛ آموزش‌ها، تمرین‌ها و آزمون‌های ذخیره‌شده فعال می‌مانند.</p><p id="fouramiOfflineLoginStatus" class="muted" role="status" aria-live="polite" style="font-size:11px;line-height:1.4;overflow-wrap:anywhere;margin:6px 0 0"></p>';
    const usernameLabel=document.querySelector('label[for="studentNameInput"]');
    if(usernameLabel)usernameLabel.textContent='نام کاربری';
    const username=$offline('studentNameInput');if(username)username.placeholder='نام کاربری';
    const button=$offline('studentLoginConfirm');
    if(button)button.textContent='ورود به برنامه';
  }
  function addOfflineLoginUi(){
    const onlineButton=$offline('studentLoginConfirm');
    if(!onlineButton||$offline('fouramiUnifiedStudentLogin'))return;
    const panel=document.createElement('section');
    panel.id='fouramiUnifiedStudentLogin';
    panel.className='notice';
    onlineButton.insertAdjacentElement('afterend',panel);
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
    document.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target.closest('#studentLoginConfirm'):null;
      if(!target||navigator.onLine)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      void loginWithOfflinePin();
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||navigator.onLine)return;
      const target=event.target;
      if(!(target instanceof Element)||!target.matches('#studentNameInput,#studentPasswordInput'))return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      void loginWithOfflinePin();
    },true);
    const onlineLoginError=$offline('studentLoginError');
    if(onlineLoginError&&'MutationObserver' in window){
      let fallbackQueued=false;
      const observer=new MutationObserver(()=>{
        const message=String(onlineLoginError.textContent||'');
        const networkFailure=/(failed to fetch|fetch failed|network|connection|timeout|timed out|اتصال|شبکه|در دسترس نیست|پروکسی|gateway|502|503|504)/i.test(message);
        if(fallbackQueued||onlineLoginError.classList.contains('hidden')||!networkFailure)return;
        fallbackQueued=true;
        Promise.resolve().then(async()=>{
          try{
            const latest=String(onlineLoginError.textContent||'');
            if(!navigator.onLine||/(failed to fetch|fetch failed|network|connection|timeout|timed out|اتصال|شبکه|در دسترس نیست|پروکسی|gateway|502|503|504)/i.test(latest))await loginWithOfflinePin();
          }finally{fallbackQueued=false}
        });
      });
      observer.observe(onlineLoginError,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
    }
    const profileNav=document.querySelector('[data-app-view="profile"]');
    if(profileNav)profileNav.addEventListener('click',()=>setTimeout(()=>{void refreshOfflineProfilePanel()},0));
    const studentEnter=$offline('studentEnter');
    if(studentEnter)studentEnter.addEventListener('click',()=>{
      if($offline('studentNameInput'))$offline('studentNameInput').value='';
      if($offline('studentPasswordInput'))$offline('studentPasswordInput').value='';
      if($offline('fouramiOfflineLoginStatus'))$offline('fouramiOfflineLoginStatus').textContent='';
    });
    const originalStudentBack=$offline('studentBack')?.onclick;
    if($offline('studentBack'))$offline('studentBack').onclick=function(){
      if(cloudSession?.offline){
        resetUnlockedPackage();cloudSession=null;
        activeStudentName='';activeUsername='';activeProfile={};studentProgress=defaultProgress();
        practiceAsked=0;practiceCorrect=0;practiceSeen.clear();currentPractice=null;selectedPracticeAnswer=null;practiceWasChecked=false;
        examItems=[];examIndex=0;examScore=0;examSelectedAnswer=null;examAnswered=false;currentCloudAttemptGroup=null;
        show('home');
        if($offline('studentNameInput'))$offline('studentNameInput').value='';
        if($offline('studentPasswordInput'))$offline('studentPasswordInput').value='';
        if($offline('fouramiOfflineLoginStatus'))$offline('fouramiOfflineLoginStatus').textContent='';
        return;
      }
      if(originalStudentBack)originalStudentBack.call(this);
    };
    window.addEventListener('online',()=>{if(fouramiOfflineData&&cloudSession?.profile?.role==='student')void syncPending()});
    window.addEventListener('focus',()=>{if(fouramiOfflineData&&cloudSession?.profile?.role==='student'&&navigator.onLine)void syncPending()});
  }
  window.__fouramiOfflineMode={
    sync:syncPending,refreshProfile:refreshOfflineProfilePanel,savePackage,captureCurrentSession,
    queueMathAttempt,queueSubjectProgress,clearIfDifferent,resetUnlockedPackage
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
