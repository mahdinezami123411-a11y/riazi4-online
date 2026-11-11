import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const norm=(v:unknown)=>String(v??"").normalize("NFKC").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬،,\s]/g,"").toLowerCase();
const uuid=(v:unknown)=>{const s=String(v??"");return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const shuffle=<T>(items:T[]):T[]=>{const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out};
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
 if(norm(a)===norm(b))return true;
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
 if(error){console.error("course access settings read failed",error);return false}
 const settings=data?.settings&&typeof data.settings==="object"?data.settings:{};
 if(settings.courseEnabled===false)return false;
 const now=Date.now();if(settings.releaseMode==="scheduled"&&settings.releaseAt&&new Date(settings.releaseAt).getTime()>now)return false;
 const lesson=Array.isArray(settings.lessons)?settings.lessons.find((x:any)=>Number(x.id)===lessonId):null;
 if(!lesson){const isCustom=Array.isArray(settings.customLessons)&&settings.customLessons.some((x:any)=>Number(x.id)===lessonId);return isCustom?false:settings.defaultLocked!==true;}
 if(lesson.isUnlocked!==true)return false;
 if(lesson.availableFrom&&new Date(lesson.availableFrom).getTime()>now)return false;
 if(lesson.availableUntil&&new Date(lesson.availableUntil).getTime()<now)return false;
 return true;
}
async function courseFeatureAllowed(classId:string,subject:string,feature:"allowPractice"|"allowExam"):Promise<boolean>{
 const {data,error}=await admin.from("yare_course_settings").select("settings").eq("class_id",classId).eq("subject",subject).maybeSingle();
 if(error){console.error("course feature settings read failed",error);return false}
 const settings=data?.settings&&typeof data.settings==="object"?data.settings:{};
 return settings[feature]!==false;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"ورود معتبر لازم است."},401);
 try{
  const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:auth}}});
  const {data:ud,error:ue}=await client.auth.getUser();const user=ud?.user;if(ue||!user)return json({error:"نشست ورود معتبر نیست."},401);
  const {data:profile,error:pe}=await admin.from("yare_profiles").select("role,class_id").eq("id",user.id).maybeSingle();
  if(pe||!profile||!profile.class_id)return json({error:"حساب کاربری به کلاس متصل نیست."},403);
  const body=await req.json();const action=String(body.action??"");
  if(action==="create"){
   if(profile.role!=="teacher")return json({error:"فقط معلم می‌تواند فعالیت بسازد."},403);
   const title=String(body.title??"").trim().slice(0,160),type=String(body.activity_type??"practice"),scope=String(body.scope??"chapter");
   const subject=String(body.subject??"math");if(!["math","persian","dictation","science","social","gifts"].includes(subject))return json({error:"کتاب انتخاب‌شده معتبر نیست."},400);const lessonIds=Array.isArray(body.lesson_ids)?[...new Set(body.lesson_ids.map(Number).filter((x:number)=>Number.isInteger(x)&&x>=1&&x<=100))]:[];const chapterInput=Array.isArray(body.chapter_ids)?[...new Set(body.chapter_ids.map(Number).filter((x:number)=>Number.isInteger(x)&&x>=1&&x<=7))]:[];const chapters=chapterInput.length?chapterInput:[...new Set((lessonIds.length?lessonIds:[1]).map((x:number)=>Math.min(7,x)))];const finalLessonIds=lessonIds.length?lessonIds:[...chapters];
   const count=Number(body.question_count),duration=Number(body.duration_minutes),attempts=Number(body.max_attempts);
   if(!title||!chapters.length||!finalLessonIds.length||!["practice","exam","term1","term2"].includes(type)||!["chapter","multi","midterm","final","all"].includes(scope)||!Number.isInteger(count)||count<1||count>200||!Number.isInteger(duration)||duration<0||duration>300||!Number.isInteger(attempts)||attempts<1||attempts>100)return json({error:"عنوان یا تنظیمات فعالیت معتبر نیست."},400);const feature=type==="practice"?"allowPractice":"allowExam";if(!(await courseFeatureAllowed(profile.class_id,subject,feature)))return json({error:"معلم اجازهٔ این نوع فعالیت را برای کتاب انتخاب‌شده غیرفعال کرده است."},403);for(const lessonId of finalLessonIds){if(!(await courseLessonAccessible(profile.class_id,subject,lessonId)))return json({error:"یکی از درس‌های انتخاب‌شده هنوز برای دانش‌آموزان باز نشده است."},403)}
   const {data:bank,error:be}=await admin.from("yare_question_bank").select("id,chapter_id,subject,lesson_id").eq("is_active",true).eq("subject",subject).in("lesson_id",finalLessonIds).or("class_id.is.null,class_id.eq."+profile.class_id);
   if(be)return json({error:"بانک سؤال خوانده نشد."},500);
   if(!bank||bank.length<count)return json({error:`در این محدوده فقط ${bank?.length??0} سؤال فعال وجود دارد؛ تعداد سؤال را کم کن یا فصل‌های بیشتری انتخاب کن.`},400);
   const chosen=shuffle(bank).slice(0,count);
   const {data:a,error:ae}=await admin.from("yare_assignments").insert({class_id:profile.class_id,title,activity_type:type,scope,subject,lesson_ids:finalLessonIds,chapter_ids:chapters,question_count:count,duration_minutes:duration,max_attempts:attempts,random_questions:body.random_questions!==false,random_options:body.random_options!==false,show_feedback:body.show_feedback!==false,hide_score_from_peers:body.hide_score_from_peers!==false,is_published:true,created_by:user.id}).select("id,title,question_count,duration_minutes,max_attempts,is_published,created_at").single();
   if(ae||!a)return json({error:"ذخیره فعالیت ناموفق بود."},500);
   const mapping=chosen.map((q:any,i:number)=>({assignment_id:a.id,question_id:q.id,ordinal:i+1,option_order:[]}));
   const {error:me}=await admin.from("yare_assignment_questions").insert(mapping);
   if(me){await admin.from("yare_assignments").delete().eq("id",a.id);return json({error:"ثبت سؤال‌های فعالیت ناموفق بود."},500)}
   return json({ok:true,assignment:a,question_count:chosen.length});
  }
  if(action==="list"){
   if(profile.role==="teacher" && body.view_as_student!==true){
    const {data,error}=await admin.from("yare_assignments").select("id,title,subject,lesson_ids,activity_type,scope,chapter_ids,question_count,duration_minutes,max_attempts,is_published,available_from,available_until,created_at").eq("class_id",profile.class_id).order("created_at",{ascending:false});
    if(error)return json({error:"فهرست فعالیت‌ها خوانده نشد."},500);return json({assignments:data??[]});
   }
   const {data:assignments,error}=await admin.from("yare_assignments").select("id,title,subject,lesson_ids,activity_type,scope,chapter_ids,question_count,duration_minutes,max_attempts,available_from,available_until,created_at").eq("class_id",profile.class_id).eq("is_published",true).or("available_from.is.null,available_from.lte."+new Date().toISOString()).order("created_at",{ascending:false});
   if(error)return json({error:"فهرست فعالیت‌ها خوانده نشد."},500);
   const {data:attempts}=await admin.from("yare_assignment_attempts").select("assignment_id,attempt_number,status,score,total_points,submitted_at").eq("student_id",user.id);
   const available=[];for(const a of assignments??[]){if(a.available_until&&new Date(a.available_until).getTime()<Date.now())continue;const subject=String(a.subject||"math"),feature=a.activity_type==="practice"?"allowPractice":"allowExam";if(!(await courseFeatureAllowed(profile.class_id,subject,feature)))continue;const ids=Array.isArray(a.lesson_ids)&&a.lesson_ids.length?a.lesson_ids:a.chapter_ids||[1];let open=true;for(const lessonId of ids){if(!(await courseLessonAccessible(profile.class_id,subject,Number(lessonId)))){open=false;break}}if(open)available.push({...a,attempts:(attempts??[]).filter((t:any)=>t.assignment_id===a.id)})}return json({assignments:available});
  }
  if(action==="start"){
   if(profile.role!=="student"&&profile.role!=="teacher")return json({error:"این حساب مجوز شروع فعالیت را ندارد."},403);
   const id=uuid(body.assignment_id);if(!id)return json({error:"شناسه فعالیت نامعتبر است."},400);
   const {data:a,error:ae}=await admin.from("yare_assignments").select("*").eq("id",id).eq("class_id",profile.class_id).eq("is_published",true).maybeSingle();
   if(ae||!a)return json({error:"فعالیت منتشرشده‌ای برای این کلاس پیدا نشد."},404);
   const assignedSubject=String(a.subject||"math"),assignedLessons=Array.isArray(a.lesson_ids)&&a.lesson_ids.length?a.lesson_ids:a.chapter_ids||[1];const assignedFeature=a.activity_type==="practice"?"allowPractice":"allowExam";if(!(await courseFeatureAllowed(profile.class_id,assignedSubject,assignedFeature)))return json({error:"این نوع فعالیت برای کتاب انتخاب‌شده توسط معلم غیرفعال شده است."},403);for(const lessonId of assignedLessons){if(!(await courseLessonAccessible(profile.class_id,assignedSubject,Number(lessonId))))return json({error:"این فعالیت مربوط به درسی است که هنوز توسط معلم باز نشده است."},403)}
   const now=Date.now();if(a.available_from&&new Date(a.available_from).getTime()>now)return json({error:"زمان شروع فعالیت هنوز نرسیده است."},403);if(a.available_until&&new Date(a.available_until).getTime()<now)return json({error:"مهلت این فعالیت تمام شده است."},403);
   const {data:old}=await admin.from("yare_assignment_attempts").select("id,attempt_number,status,started_at,deadline_at,submitted_at").eq("assignment_id",id).eq("student_id",user.id).eq("status","in_progress").order("attempt_number",{ascending:false}).limit(1);
   let attempt=old?.[0];
   if(attempt&&attempt.deadline_at&&new Date(attempt.deadline_at).getTime()<now){await admin.from("yare_assignment_attempts").update({status:"expired",submitted_at:new Date().toISOString()}).eq("id",attempt.id);attempt=null}
   if(!attempt){
    const {data:previous}=await admin.from("yare_assignment_attempts").select("attempt_number").eq("assignment_id",id).eq("student_id",user.id);
    const next=(previous??[]).reduce((m:any,x:any)=>Math.max(m,x.attempt_number),0)+1;
    if(next>a.max_attempts)return json({error:"تعداد تلاش مجاز این فعالیت تمام شده است."},403);
    const durationDeadline=a.duration_minutes>0?now+a.duration_minutes*60000:null;
    const windowDeadline=a.available_until?new Date(a.available_until).getTime():null;
    const deadlines=[durationDeadline,windowDeadline].filter((value:number|null):value is number=>typeof value==="number"&&Number.isFinite(value));
    const deadline=deadlines.length?new Date(Math.min(...deadlines)).toISOString():null;
    const {data:created,error:ce}=await admin.from("yare_assignment_attempts").insert({assignment_id:id,student_id:user.id,class_id:profile.class_id,attempt_number:next,status:"in_progress",deadline_at:deadline}).select("id,attempt_number,status,started_at,deadline_at").single();
    if(ce||!created)return json({error:"شروع فعالیت ثبت نشد."},500);attempt=created;
   }
   if(!attempt)return json({error:"تلاش فعال پیدا نشد."},500);
   const {data:links,error:le}=await admin.from("yare_assignment_questions").select("question_id,ordinal").eq("assignment_id",id).order("ordinal");
   if(le||!links?.length)return json({error:"سؤال‌های فعالیت پیدا نشدند."},500);
   const ids=links.map((x:any)=>x.question_id);const {data:qs,error:qe}=await admin.from("yare_question_bank").select("id,chapter_id,skill,prompt,question_type,options").in("id",ids);
   if(qe||!qs)return json({error:"سؤال‌ها بارگذاری نشدند."},500);
   const ordered=links.map((x:any)=>{const q=qs.find((y:any)=>y.id===x.question_id);return q?{...q,ordinal:x.ordinal,options:a.random_options?shuffle(q.options??[]):(q.options??[])}:null}).filter(Boolean);
   const {data:answers}=await admin.from("yare_assignment_responses").select("question_id,submitted_answer").eq("attempt_id",attempt.id);
   return json({assignment:{id:a.id,title:a.title,activity_type:a.activity_type,question_count:a.question_count,duration_minutes:a.duration_minutes,show_feedback:a.show_feedback},attempt,questions:ordered,answers:answers??[]});
  }
  if(action==="answer"){
   if(profile.role!=="student"&&profile.role!=="teacher")return json({error:"این حساب مجوز ثبت پاسخ را ندارد."},403);
   const attemptId=uuid(body.attempt_id),questionId=uuid(body.question_id);if(!attemptId||!questionId)return json({error:"شناسه فعالیت یا سؤال نامعتبر است."},400);
   const {data:t,error:te}=await admin.from("yare_assignment_attempts").select("id,assignment_id,student_id,class_id,status,deadline_at").eq("id",attemptId).eq("student_id",user.id).maybeSingle();
   if(te||!t||t.class_id!==profile.class_id)return json({error:"تلاش فعالیت متعلق به این حساب نیست."},403);
   if(t.status!=="in_progress")return json({error:"این تلاش قبلاً بسته شده است."},409);
   const {data:a,error:ae}=await admin.from("yare_assignments").select("show_feedback,activity_type,is_published,available_until").eq("id",t.assignment_id).maybeSingle();
   if(ae||!a||a.is_published!==true)return json({error:"این فعالیت دیگر منتشرشده نیست."},409);
   const now=Date.now();
   if(a.available_until&&new Date(a.available_until).getTime()<now){await admin.from("yare_assignment_attempts").update({status:"expired",submitted_at:new Date().toISOString()}).eq("id",t.id);return json({error:"مهلت این فعالیت تمام شده است."},409)}
   if(t.deadline_at&&new Date(t.deadline_at).getTime()<now){await admin.from("yare_assignment_attempts").update({status:"expired",submitted_at:new Date().toISOString()}).eq("id",t.id);return json({error:"زمان آزمون تمام شده است."},409)}
   const {data:existing,error:existingErr}=await admin.from("yare_assignment_responses").select("id").eq("attempt_id",t.id).eq("question_id",questionId).maybeSingle();
   if(existingErr)return json({error:"بررسی پاسخ قبلی ناموفق بود."},500);
   if(existing)return json({error:"پاسخ این سؤال قبلاً ثبت شده و قابل تغییر نیست."},409);
   const {data:link}=await admin.from("yare_assignment_questions").select("question_id").eq("assignment_id",t.assignment_id).eq("question_id",questionId).maybeSingle();if(!link)return json({error:"این سؤال متعلق به فعالیت نیست."},403);
   const {data:q}=await admin.from("yare_question_bank").select("id,chapter_id,skill,prompt,question_type,options").eq("id",questionId).maybeSingle();const {data:key}=await admin.from("yare_question_answer_keys").select("accepted,explanation").eq("question_id",questionId).maybeSingle();if(!q||!key)return json({error:"پاسخ‌نامه آماده نیست."},500);
   const raw=body.submitted_answer;const valid=typeof raw==="string"&&raw.length<=1000||Array.isArray(raw)&&raw.length<=10&&raw.every((x:any)=>typeof x==="string"&&x.length<=300);if(!valid)return json({error:"پاسخ نامعتبر است."},400);
   const expected=(key.accepted??[]).map(norm);let correct=false;if(q.question_type==="matching"&&Array.isArray(raw)){const got=raw.map(norm);correct=got.length===4&&expected.length===4&&got.every((x:string,i:number)=>x===expected[i])}else if(q.question_type==="multi"&&Array.isArray(raw)){const got=raw.map(norm).sort(),want=[...expected].sort();correct=got.length===want.length&&got.every((x:string,i:number)=>x===want[i])}else correct=(key.accepted??[]).some((x:unknown)=>answersEquivalent(x,raw));
   const {error:re}=await admin.from("yare_assignment_responses").upsert({attempt_id:t.id,question_id:questionId,submitted_answer:raw,is_correct:correct,points:correct?1:0},{onConflict:"attempt_id,question_id"});if(re)return json({error:"ثبت پاسخ ناموفق بود."},500);
   if(a.show_feedback===false)return json({saved:true,feedback_hidden:true});
   const acceptedLabels=(key.accepted??[]).map((value:unknown)=>String(value??"").trim()).filter((value:string)=>value.length>0).filter((value:string,index:number,all:string[])=>all.findIndex((other:string)=>norm(other)===norm(value))===index);
    const correctAnswer=acceptedLabels.join("، ");
    const analysis=personalizeQuestionAnalysis(q,acceptedLabels,String(key.explanation??"").trim());
    return json({saved:true,correct,correct_answer:correctAnswer,correct_answers:acceptedLabels,explanation:analysis,question_prompt:q.prompt,question_type:q.question_type,skill:q.skill});
  }
  if(action==="finish"){
   if(profile.role!=="student"&&profile.role!=="teacher")return json({error:"این حساب مجوز تحویل فعالیت را ندارد."},403);
   const attemptId=uuid(body.attempt_id);if(!attemptId)return json({error:"شناسه تلاش نامعتبر است."},400);
   const {data:t}=await admin.from("yare_assignment_attempts").select("id,assignment_id,student_id,status,deadline_at").eq("id",attemptId).eq("student_id",user.id).maybeSingle();if(!t||t.status!=="in_progress")return json({error:"تلاش فعال پیدا نشد."},409);
   const {data:responses}=await admin.from("yare_assignment_responses").select("is_correct,points").eq("attempt_id",t.id);
   const {data:a}=await admin.from("yare_assignments").select("question_count,activity_type,is_published,available_until").eq("id",t.assignment_id).single();
   if(!a||a.is_published!==true)return json({error:"این فعالیت دیگر منتشرشده نیست."},409);
   const total=a?.question_count??0, answered=responses?.length??0, points=(responses??[]).reduce((sum:number,x:any)=>sum+Number(x.points??0),0);
   const now=Date.now();
   const expired=(!!t.deadline_at&&new Date(t.deadline_at).getTime()<now)||(!!a.available_until&&new Date(a.available_until).getTime()<now);
   const status=expired?"expired":"submitted";
   const {error:fe}=await admin.from("yare_assignment_attempts").update({status,submitted_at:new Date().toISOString(),score:points,total_points:total}).eq("id",t.id);if(fe)return json({error:"تحویل فعالیت ناموفق بود."},500);
   return json({ok:true,status,answered,total,score:points,total_points:total,grade_out_of_20:total?Math.round(points/total*2000)/100:null});
  }
  return json({error:"action نامعتبر است."},400);
 }catch(e){console.error("manage-assignments",e);return json({error:"خطای غیرمنتظره در مدیریت فعالیت."},500)}
});