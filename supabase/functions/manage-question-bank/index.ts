import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile, x-supabase-api-version","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
const url=Deno.env.get("SUPABASE_URL")!;const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const validUuid=(v:unknown):string|null=>{const s=String(v??"");return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"نشست ورود معتبر نیست."},401);
 try{
  const userClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:auth}}});
  const {data:userData,error:userErr}=await userClient.auth.getUser();const user=userData?.user;
  if(userErr||!user)return json({error:"نشست کاربر تأیید نشد."},401);
  const {data:profile,error:pErr}=await admin.from("yare_profiles").select("role,class_id").eq("id",user.id).maybeSingle();
  if(pErr||!profile||profile.role!=="teacher")return json({error:"فقط حساب معلم می‌تواند بانک سؤال را تغییر دهد."},403);
  if(!profile.class_id)return json({error:"حساب معلم هنوز به کلاس اختصاص داده نشده است."},403);
  const body=await req.json();const action=String(body.action??"");
  if(action==="get"){
   const id=validUuid(body.id);if(!id)return json({error:"شناسه سؤال معتبر نیست."},400);
   const {data:q,error:qErr}=await admin.from("yare_question_bank").select("*").eq("id",id).maybeSingle();
   if(qErr||!q)return json({error:"سؤال پیدا نشد."},404);
   if(q.class_id && q.class_id!==profile.class_id)return json({error:"این سؤال متعلق به کلاس دیگری است."},403);
   const {data:key,error:keyErr}=await admin.from("yare_question_answer_keys").select("accepted,explanation").eq("question_id",id).maybeSingle();
   if(keyErr||!key)return json({error:"پاسخ‌نامه سؤال پیدا نشد."},500);
   return json({question:q,answer_key:key});
  }
  if(action!=="save")return json({error:"action نامعتبر است."},400);
  const chapter=Number(body.chapter_id),type=String(body.question_type??"");
  const subject=String(body.subject??"math"),lessonId=Number(body.lesson_id??chapter);
  if(!["math","persian","dictation","science","social","gifts"].includes(subject))return json({error:"کتاب انتخاب‌شده معتبر نیست."},400);
  if(!Number.isInteger(lessonId)||lessonId<1||lessonId>100)return json({error:"شماره درس باید بین ۱ تا ۱۰۰ باشد."},400);
  const skill=String(body.skill??"").trim().slice(0,120),prompt=String(body.prompt??"").trim().slice(0,3000),difficulty=String(body.difficulty??"medium");
  const options=Array.isArray(body.options)?body.options.map((x:unknown)=>String(x).trim().slice(0,300)):[];
  const accepted=Array.isArray(body.accepted)?body.accepted.map((x:unknown)=>String(x).trim().slice(0,500)):[];
  const explanation=String(body.explanation??"").trim().slice(0,5000);
  if(!Number.isInteger(chapter)||chapter<1||chapter>7)return json({error:"فصل باید بین ۱ تا ۷ باشد."},400);
  if(!["mc","blank_mc","matching","input","tf","multi"].includes(type))return json({error:"نوع سؤال معتبر نیست."},400);
  if(!prompt||!skill||!accepted.length||!explanation)return json({error:"متن سؤال، مبحث، پاسخ صحیح و تحلیل اختصاصی حل سؤال همگی لازم هستند."},400);
  if(!["easy","medium","hard"].includes(difficulty))return json({error:"دشواری معتبر نیست."},400);
  if(type==="input"){if(options.length!==0)return json({error:"سؤال پاسخ کوتاه نباید گزینه داشته باشد."},400)}
  else if(type==="matching"){
   if(options.length!==8||options.some((x:string)=>!x))return json({error:"جورکردنی باید چهار مورد در هر ستون داشته باشد."},400);
   if(new Set(options.map((x:string)=>x.normalize("NFKC").trim().toLocaleLowerCase())).size!==8)return json({error:"موارد جورکردنی باید یکتا باشند."},400);
   if(accepted.length!==4||new Set(accepted.map((x:string)=>x.normalize("NFKC").trim().toLocaleLowerCase())).size!==4||accepted.some((x:string)=>!options.slice(4,8).includes(x)))return json({error:"پاسخ جورکردنی باید چهار پاسخ متفاوت از ستون راست باشد."},400);
  }else{
   const expectedCount=type==="tf"?2:4;
   if(options.length!==expectedCount||options.some((x:string)=>!x))return json({error:`برای این نوع سؤال ${expectedCount} گزینه کامل لازم است.`},400);
   if(accepted.some((x:string)=>!options.includes(x)))return json({error:"همه پاسخ‌های صحیح باید دقیقاً با یکی از گزینه‌ها برابر باشند."},400);
   if(type!=="multi"&&accepted.length!==1)return json({error:"این نوع سؤال باید دقیقاً یک پاسخ صحیح داشته باشد."},400);
  }
  let id=validUuid(body.id),sourceQuestionId:null|string=null,questionId=id;
  if(id){
   const {data:existing,error:eErr}=await admin.from("yare_question_bank").select("id,class_id").eq("id",id).maybeSingle();
   if(eErr||!existing)return json({error:"سؤال برای ویرایش پیدا نشد."},404);
   if(existing.class_id&&existing.class_id!==profile.class_id)return json({error:"این سؤال متعلق به کلاس دیگری است."},403);
   if(!existing.class_id){sourceQuestionId=id;questionId=null}
  }
  const {data:savedId,error:saveErr}=await admin.rpc("yare_save_question_with_key",{
   p_question_id:questionId,
   p_source_question_id:sourceQuestionId,
   p_class_id:profile.class_id,
   p_chapter_id:chapter,
   p_subject:subject,
   p_lesson_id:lessonId,
   p_skill:skill,
   p_prompt:prompt,
   p_question_type:type,
   p_options:options,
   p_difficulty:difficulty,
   p_accepted:accepted,
   p_explanation:explanation,
   p_created_by:user.id
  });
  if(saveErr||!savedId){console.error("transactional question save failed",saveErr);return json({error:"ذخیرهٔ تراکنشی سؤال و پاسخ‌نامه ناموفق بود؛ هیچ تغییری اعمال نشد."},500)}
  id=String(savedId);
  return json({ok:true,id});
 }catch(error){console.error("manage-question-bank failed",error);return json({error:"خطای غیرمنتظره در مدیریت بانک سؤال."},500)}
});