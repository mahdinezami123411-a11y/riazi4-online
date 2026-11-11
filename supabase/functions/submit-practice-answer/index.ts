import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile, x-supabase-api-version","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
const url=Deno.env.get("SUPABASE_URL")!;const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
function normalize(v:unknown):string{return String(v??"").normalize("NFKC").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫]/g,".").replace(/[٬،,]/g,"").replace(/\s+/g,"").toLowerCase()}
function validUuid(v:unknown):string|null{const s=String(v??"");return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null}
function numericAnswerValue(v:unknown):number|null{
 const text=String(v??"").normalize("NFKC")
  .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[٫]/g,".").replace(/[٬،,\s]/g,"").replace(/[−–]/g,"-");
 if(/^[+-]?\d+(?:\.\d+)?$/.test(text))return Number(text);
 const fraction=text.match(/^([+-]?\d+)\/([+-]?\d+)$/);
 if(fraction&&Number(fraction[2])!==0)return Number(fraction[1])/Number(fraction[2]);
 return null;
}
function answersEquivalent(a:unknown,b:unknown):boolean{
 if(normalize(a)===normalize(b))return true;
 const x=numericAnswerValue(a),y=numericAnswerValue(b);
 if(x===null||y===null||!Number.isFinite(x)||!Number.isFinite(y))return false;
 return Math.abs(x-y)<=1e-9*Math.max(1,Math.abs(x),Math.abs(y));
}
function personalizeQuestionAnalysis(question:any, acceptedLabels:string[], saved:string):string {
 const authored=String(saved??"").trim();
 if(authored)return authored;
 const prompt=String(question?.prompt??"").trim();
 const answer=acceptedLabels.join("، ")||"پاسخ ثبت‌شده";
 return "پاسخ صحیح این سؤال «"+answer+"» است."+(prompt?" صورت سؤال را با دقت بخوان و قانون مربوط به همین مبحث را روی داده‌های آن اجرا کن؛ پاسخ را با خواستهٔ سؤال بسنج.":"");
}
async function courseLessonAccessible(classId:string,subject:string,lessonId:number):Promise<boolean>{
 const {data,error}=await admin.from("yare_course_settings").select("settings").eq("class_id",classId).eq("subject",subject).maybeSingle();
 if(error){console.error("practice course access read failed",error);return false}
 const settings=data?.settings&&typeof data.settings==="object"?data.settings:{};
 if(settings.courseEnabled===false)return false;
 const now=Date.now();if(settings.releaseMode==="scheduled"&&settings.releaseAt&&new Date(settings.releaseAt).getTime()>now)return false;
 const lesson=Array.isArray(settings.lessons)?settings.lessons.find((x:any)=>Number(x.id)===lessonId):null;
 if(!lesson){const isCustom=Array.isArray(settings.customLessons)&&settings.customLessons.some((x:any)=>Number(x.id)===lessonId);return isCustom?false:settings.defaultLocked!==true}
 if(lesson.isUnlocked!==true)return false;
 if(lesson.availableFrom&&new Date(lesson.availableFrom).getTime()>now)return false;
 if(lesson.availableUntil&&new Date(lesson.availableUntil).getTime()<now)return false;
 return true;
}
async function courseFeatureAllowed(classId:string,subject:string,feature:"allowPractice"|"allowExam"):Promise<boolean>{
 const {data,error}=await admin.from("yare_course_settings").select("settings").eq("class_id",classId).eq("subject",subject).maybeSingle();
 if(error){console.error("practice course feature read failed",error);return false}
 const settings=data?.settings&&typeof data.settings==="object"?data.settings:{};
 return settings[feature]!==false;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"نشست ورود معتبر نیست؛ دوباره وارد شو."},401);
 try{
  const userClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:auth}}});
  const {data:userData,error:userErr}=await userClient.auth.getUser();const user=userData?.user;
  if(userErr||!user)return json({error:"نشست کاربر تأیید نشد."},401);
  const {data:profile,error:profileErr}=await admin.from("yare_profiles").select("role,class_id").eq("id",user.id).maybeSingle();
  if(profileErr||!profile||!(profile.role==="student"||profile.role==="teacher"))return json({error:"این حساب مجوز ثبت تمرین را ندارد."},403);
  if(!profile.class_id)return json({error:"این حساب هنوز به کلاس اختصاص داده نشده است؛ با معلم تماس بگیر."},403);
  const body=await req.json();const questionId=validUuid(body.question_id);if(!questionId)return json({error:"سؤال معتبر نیست."},400);
  const source=String(body.source??"practice").slice(0,48);if(!/^(practice|exam):[a-z0-9:_-]{1,40}$/i.test(source))return json({error:"نوع فعالیت نامعتبر است."},400);
  const attemptGroup=validUuid(body.attempt_group);
  const clientAttemptRaw=body.client_attempt_id;
  const clientAttemptId=clientAttemptRaw==null?null:validUuid(clientAttemptRaw);
  if(clientAttemptRaw!=null&&!clientAttemptId)return json({error:"شناسهٔ تلاش آفلاین معتبر نیست."},400);
  const {data:question,error:qErr}=await admin.from("yare_question_bank").select("id,chapter_id,skill,prompt,question_type,options,is_active,class_id,subject,lesson_id").eq("id",questionId).eq("is_active",true).maybeSingle();
  if(qErr||!question)return json({error:"این سؤال فعال نیست یا حذف شده است."},404);
  if(question.class_id&&question.class_id!==profile.class_id)return json({error:"این سؤال برای کلاس شما نیست."},403);
  const questionSubject=String(question.subject||"math"),questionLesson=Number(question.lesson_id??question.chapter_id??0);
  const requestedFeature=source.toLowerCase().startsWith("exam:")?"allowExam":"allowPractice";
  if(!(await courseFeatureAllowed(profile.class_id,questionSubject,requestedFeature)))return json({error:"این نوع فعالیت برای کتاب انتخاب‌شده توسط معلم غیرفعال شده است."},403);
  if(questionLesson>0&&!(await courseLessonAccessible(profile.class_id,questionSubject,questionLesson)))return json({error:"این درس هنوز توسط معلم برای دانش‌آموزان باز نشده یا زمان دسترسی آن به پایان رسیده است."},403);
  const {data:key,error:keyErr}=await admin.from("yare_question_answer_keys").select("accepted,explanation").eq("question_id",questionId).maybeSingle();
  if(keyErr||!key||!Array.isArray(key.accepted))return json({error:"پاسخ‌نامهٔ این سؤال هنوز تنظیم نشده است."},500);
  const raw=body.submitted_answer;const valid=typeof raw==="string"?raw.length<=1000:Array.isArray(raw)&&raw.length<=10&&raw.every((x:unknown)=>typeof x==="string"&&x.length<=300);
  if(raw===undefined||raw===null||!valid)return json({error:"پاسخ خالی یا نامعتبر است."},400);
  const accepted=key.accepted.map(normalize);let correct=false;
  if(question.question_type==="matching"&&Array.isArray(raw)){const submitted=raw.map(normalize),expected=accepted.map(normalize);correct=submitted.length===4&&expected.length===4&&submitted.every((x,i)=>x===expected[i])}
  else if(question.question_type==="multi"&&Array.isArray(raw)){const submitted=raw.map(normalize).sort();const expected=[...accepted].sort();correct=submitted.length===expected.length&&submitted.every((x,i)=>x===expected[i])}
  else{const answer=normalize(raw);correct=answer.length>0&&key.accepted.some((x:unknown)=>answersEquivalent(x,raw))}
  const acceptedLabels=key.accepted.map((value:unknown)=>String(value??"").trim()).filter((value:string)=>value.length>0).filter((value:string,index:number,all:string[])=>all.findIndex((other:string)=>normalize(other)===normalize(value))===index);
  const correctAnswer=acceptedLabels.join("، ");
  const analysis=personalizeQuestionAnalysis(question,acceptedLabels,String(key.explanation??"").trim());
  const normalizeSubmitted=(value:unknown):string=>Array.isArray(value)?JSON.stringify(value.map(normalize)):normalize(value);
  if(clientAttemptId){
    const {data:existing,error:existingErr}=await admin.from("yare_practice_attempts")
      .select("id,created_at,question_id,attempt_group,source,submitted_answer,is_correct")
      .eq("student_id",user.id).eq("client_attempt_id",clientAttemptId).maybeSingle();
    if(existingErr){console.error("offline idempotency lookup failed",existingErr);return json({error:"بررسی تلاش آفلاین ناموفق بود."},500)}
    if(existing){
      const sameSubmission=existing.question_id===question.id&&existing.attempt_group===attemptGroup&&existing.source===source&&normalizeSubmitted(existing.submitted_answer)===normalizeSubmitted(raw);
      if(!sameSubmission)return json({error:"شناسهٔ تلاش قبلاً برای پاسخ دیگری استفاده شده است."},409);
      return json({correct:existing.is_correct,correct_answer:correctAnswer,correct_answers:acceptedLabels,explanation:analysis,question_prompt:question.prompt,question_type:question.question_type,skill:question.skill,attempt_id:existing.id,created_at:existing.created_at,chapter_id:question.chapter_id,duplicate:true});
    }
  }
  const {data:attempt,error:insertErr}=await admin.from("yare_practice_attempts").insert({student_id:user.id,class_id:profile.class_id,question_id:question.id,attempt_group:attemptGroup,source,chapter_id:question.chapter_id,question_text:question.prompt,question_type:question.question_type,submitted_answer:raw,is_correct:correct,scoring_source:"server",offline_sync:!!clientAttemptId,client_attempt_id:clientAttemptId}).select("id,created_at").single();
  if(insertErr){console.error("attempt insert failed",insertErr);return json({error:"ثبت پاسخ در پایگاه داده ناموفق بود."},500)}
  return json({correct,correct_answer:correctAnswer,correct_answers:acceptedLabels,explanation:analysis,question_prompt:question.prompt,question_type:question.question_type,skill:question.skill,attempt_id:attempt.id,created_at:attempt.created_at,chapter_id:question.chapter_id}); }catch(error){console.error("submit-practice-answer failed",error);return json({error:"خطای غیرمنتظره هنگام ثبت پاسخ."},500)}
});