/* FairGame Initiative — teacher onboarding and editable school profile. */
(function(){
'use strict';
const STEPS=[
{title:'About you and your school',intro:'Help us understand your school and find the right local pathways.',fields:[
['contact_name','Your name','text',''],['school_role','Your role at school','select',['Classroom teacher','Science teacher','STEM coordinator','Science department chair','Club advisor','School administrator','District staff','Other']],
['school_name','School or organization name','text','',1],['school_type','School type','select',['Public','Private','Charter','Homeschool network','Other']],
['district','School district','text',''],['city','City','text',''],['state_code','State (two-letter code)','text',''],['postal_code','ZIP code','text',''],
['grade_bands','Which grades could participate?','checks',['Elementary (K–5)','Middle school (6–8)','High school (9–12)','Multiple grade bands'],1],
['school_enrollment','Approximate school enrollment','select',['Under 100','100–299','300–599','600–999','1,000–1,999','2,000+','Not sure']]
]},
{title:'Your science fair vision',intro:'It is completely fine if you are still exploring the idea.',fields:[
['program_stage','What best describes your situation?','select',['Starting a science fair from scratch','Restarting or rebuilding a previous fair','Improving an existing science fair','Starting a STEM / science club first','Expanding to a district or multi-school fair','Not sure yet']],
['fair_format','How would you like to host the event?','select',['In person','Virtual','Hybrid','Not sure yet']],
['fair_type','What kind of event are you envisioning?','checks',['Traditional science fair and experiments','STEM innovation / engineering showcase','Research and presentation fair','Environmental or sustainability fair','STEM career and community showcase','Combination / not sure'],1],
['student_count','How many students might participate?','select',['1–10','11–25','26–50','51–100','101–250','250+','Not sure']],
['project_count','How many projects do you anticipate?','select',['1–10','11–25','26–50','51–100','100+','Not sure']],
['participation_mode','How will students participate?','select',['Individual projects','Small teams','Both individual and team projects','Not sure']],
['event_timing','When would you ideally host your first event?','text','e.g. Spring 2027'],
['event_frequency','Is this intended to be recurring?','select',['One-time event','Annual event','Semester / twice yearly','Not sure']],
['school_hours','When would it take place?','select',['During school hours','After school','Weekend','Combination / not sure']],
['stem_focus','Which STEM areas are priorities?','checks',['Biology / life sciences','Chemistry','Physics / engineering','Environmental science','Computer science / mathematics','Medicine / health sciences','Agriculture / food science','Broad STEM exposure'],1]
]},
{title:'What is already in place?',intro:'Identify existing support and the gaps where we can help.',fields:[
['admin_buy_in','Do you have administrative approval?','select',['Yes','No','In progress','Not sure who to ask']],
['organizing_team','Do you have an organizing teacher or team?','select',['Yes, a team','Yes, just me','A few interested staff','No, need help recruiting']],
['student_interest','Have students expressed interest?','select',['Yes, students are recruited','Some interest / informal conversations','Not yet','Need help recruiting']],
['funding_status','Do you have school funding allocated?','select',['Yes, fully funded','Partially funded','No funding yet','Need help identifying funding','Not sure']],
['judge_status','Do you already have judges?','select',['Yes, enough judges','A few judges','No judges yet','Need help finding them']],
['mentor_status','Do you have STEM mentors or speakers?','select',['Yes','A few','No','Would like help finding them']],
['venue_status','Do you have a location for the event?','select',['Yes','No','Considering virtual','Need help finding a venue']],
['supplies_status','Do you have project supplies and equipment?','select',['Yes, sufficient','Some supplies','No','Need donated materials']],
['parent_support','Do you have parent or community support?','select',['Strong support','Some support','Not yet','Not sure']],
['competition_pathway','Are you connected to a district, regional, or state science fair?','select',['Yes','No','In progress','Not sure which fair serves our school']]
]},
{title:'Funding, materials, and logistics',intro:'Estimates are fine. This helps prioritize practical support.',fields:[
['budget_range','What is your approximate available budget?','select',['No budget yet','Under $250','$250–$500','$500–$1,000','$1,000–$2,500','$2,500–$5,000','$5,000+','Not sure']],
['budget_needs','What would funding need to cover?','checks',['Project materials and equipment','Display boards / printing','Awards and student prizes','Venue and event setup','Food and refreshments','Transportation','Competition registration','Accessibility / translation','Other'],1],
['student_cost','Should participation be free for students?','select',['Yes, completely free','Prefer free, but some costs may be possible','Some student costs are acceptable','Not decided']],
['grant_interest','Would you like help identifying grants?','select',['Yes','Maybe later','No']],
['materials_donations','Would donated equipment or materials help?','select',['Yes','No','Not sure']],
['logistics_notes','Any scheduling, transportation, technology, or facility constraints?','textarea','Optional — share school-level logistics only.',1]
]},
{title:'Community partners and sponsors',intro:'Choose the types of organizations that could contribute. You do not need existing contacts.',fields:[
['partner_types','Which local partners would be useful?','checks',['Engineering / manufacturing companies','Hospitals / healthcare organizations','Universities / colleges / research labs','Technology companies','Environmental / energy organizations','Banks / credit unions','Grocery stores / restaurants','Local retailers / small businesses','Community foundations','Professional STEM associations'],1],
['partner_support','What could partners contribute?','checks',['Financial sponsorship','Judges and STEM professionals','Mentors or guest speakers','Equipment and project supplies','Prizes / scholarships','Food and refreshments','Venue / event space','Employee volunteers'],1],
['sponsor_history','Have you contacted businesses or received sponsorship before?','select',['Yes, existing sponsors','Contacted businesses, no support yet','No, starting from scratch','Not sure']],
['known_stem_companies','Three STEM companies or organizations you might approach (optional)','textarea','List employers, labs, universities, hospitals, or companies you already know.',1],
['known_community_businesses','Three community businesses that support school activities (optional)','textarea','For example, local banks, grocery stores, restaurants, or retailers.',1],
['existing_connections','Do you already have relationships with potential partners?','textarea','Optional — organization names or existing relationships.']
]},
{title:'Judges, mentors, and volunteers',intro:'Tell us which people you need and how you would like to involve them.',fields:[
['judges_needed','Approximately how many judges might you need?','select',['1–3','4–6','7–10','11–20','20+','Not sure']],
['judge_background','What backgrounds would you prefer for judges?','checks',['STEM professionals','University faculty / researchers','Graduate or undergraduate students','Science teachers / retired educators','Combination / open to all'],1],
['judge_format','Would virtual judges be helpful?','select',['Yes','In-person preferred','Either works','Not sure']],
['mentor_interest','Would students benefit from mentors before the fair?','select',['Yes, one-on-one mentors','Yes, group workshops / speakers','Both','No','Not sure']],
['volunteer_needs','What volunteer help might you need?','checks',['Event setup and check-in','Student recruitment','Project workshops','Judging support','Food / hospitality','Photography / communications','Cleanup and logistics','Not sure'],1]
]},
{title:'Your priorities and portal preferences',intro:'These answers help us tailor the Teacher Portal and recommend the next best actions.',fields:[
['biggest_challenges','What are your biggest challenges right now?','checks',['Getting principal / district approval','Finding funding or grants','Recruiting students','Finding judges','Finding mentors','Finding volunteers','Finding sponsors','Getting supplies and equipment','Choosing an event format','Understanding competition registration','Building a realistic timeline','Getting parent involvement','Other'],1],
['support_wanted','What would you most like FairGame to help with?','checks',['A personalized launch checklist','Administrative approval / proposal support','Local sponsor and partner ideas','Grant and funding opportunities','Finding judges','Finding STEM mentors','Student recruitment and project ideas','Event planning and logistics','Competition pathway and registration','Direct help from a FairGame team member'],1],
['contact_preference','How would you like FairGame to support you?','select',['Send me resources and let me work independently','Help me make connections to partners','Work with me more directly as I organize','A combination of all three']],
['follow_up_preference','Would you like a FairGame team member to follow up?','select',['Yes, please contact me','Maybe later','Not right now']],
['additional_context','Anything else we should know?','textarea','Optional context, goals, or questions for the FairGame team.',1]
]}
];
let userId=null,answers={},step=0,ready=false,busy=false;
const $=id=>document.getElementById(id);
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ensureUi(){
 if($('fgTeacherOnboarding'))return;
 const b=document.createElement('div');b.id='fgTeacherOnboarding';b.className='fg-onboarding-backdrop';b.hidden=true;
 b.innerHTML='<section class="fg-onboarding" role="dialog" aria-modal="true" aria-labelledby="fgOnboardingTitle"><header class="fg-onboarding-head"><div class="fg-onboarding-eyebrow">FairGame · Teacher setup</div><h2 id="fgOnboardingTitle">Let’s make your portal work for your school.</h2><p id="fgOnboardingIntro">Answer what you can. You can skip questions, save progress, and update everything later.</p><div class="fg-onboarding-progress"><span id="fgOnboardingProgress" style="width:0%"></span></div><div class="fg-onboarding-stepmeta"><span id="fgOnboardingStep">Step 1 of 7</span><span>About 5–8 minutes · Optional questions</span></div></header><div class="fg-onboarding-body"><div class="fg-onboarding-grid" id="fgOnboardingFields"></div></div><footer class="fg-onboarding-foot"><div class="fg-onboarding-foot-left"><button type="button" class="fg-onboarding-btn secondary" id="fgOnboardingBack">← Back</button><button type="button" class="fg-onboarding-btn secondary" id="fgOnboardingLater">Save & finish later</button></div><div class="fg-onboarding-foot-right"><span class="fg-onboarding-status" id="fgOnboardingStatus" aria-live="polite"></span><button type="button" class="fg-onboarding-btn" id="fgOnboardingNext">Continue →</button></div></footer></section>';
 document.body.appendChild(b);
 $('fgOnboardingBack').onclick=()=>{if(step>0){step--;renderStep();}};
 $('fgOnboardingNext').onclick=nextStep;
 $('fgOnboardingLater').onclick=saveAndClose;
 b.addEventListener('click',e=>{if(e.target===b)saveAndClose();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('fgTeacherOnboarding').hidden)saveAndClose();});
}
function fieldHtml(f){
 const id=f[0],label=f[1],type=f[2],opts=f[3],full=f[4],val=answers[id];
 let control='';
 if(type==='select')control='<select id="fgf_'+id+'"><option value="">Choose an option</option>'+opts.map(o=>'<option value="'+esc(o)+'" '+(val===o?'selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
 else if(type==='checks'){const selected=Array.isArray(val)?val:[];control='<div class="fg-onboarding-checks">'+opts.map(o=>'<label class="fg-onboarding-check"><input type="checkbox" data-fg-check="'+id+'" value="'+esc(o)+'" '+(selected.includes(o)?'checked':'')+'><span>'+esc(o)+'</span></label>').join('')+'</div>';}
 else if(type==='textarea')control='<textarea id="fgf_'+id+'" placeholder="'+esc(opts||'')+'">'+esc(val||'')+'</textarea>';
 else control='<input id="fgf_'+id+'" type="text" value="'+esc(val||'')+'" placeholder="'+esc(opts||'')+'" '+(id==='postal_code'?'inputmode="numeric" maxlength="10"':'')+' '+(id==='state_code'?'maxlength="2" autocapitalize="characters"':'')+'/>';
 return '<div class="fg-onboarding-field '+(full?'full':'')+'"><label '+(type!=='checks'?'for="fgf_'+id+'"':'')+'>'+esc(label)+'</label>'+control+'</div>';
}
function collect(){STEPS[step].fields.forEach(f=>{if(f[2]==='checks')answers[f[0]]=Array.from(document.querySelectorAll('[data-fg-check="'+f[0]+'"]:checked')).map(e=>e.value);else{const e=$('fgf_'+f[0]);if(e)answers[f[0]]=e.value.trim();}});if(answers.state_code)answers.state_code=answers.state_code.toUpperCase().slice(0,2);}
function renderStep(){const s=STEPS[step];$('fgOnboardingTitle').textContent=s.title;$('fgOnboardingIntro').textContent=s.intro;$('fgOnboardingStep').textContent='Step '+(step+1)+' of '+STEPS.length;$('fgOnboardingProgress').style.width=((step+1)/STEPS.length*100)+'%';$('fgOnboardingFields').innerHTML=s.fields.map(fieldHtml).join('');$('fgOnboardingBack').disabled=step===0;$('fgOnboardingBack').style.opacity=step===0?'.45':'1';$('fgOnboardingNext').textContent=step===STEPS.length-1?'Finish setup →':'Continue →';$('fgOnboardingStatus').textContent='';}
async function persist(done){if(!sb||!userId)return{error:new Error('Your account session is not available. Please sign in again.')};const row={user_id:userId,answers:answers,updated_at:new Date().toISOString()};if(done)row.completed_at=new Date().toISOString();return await sb.from('teacher_onboarding_profiles').upsert(row,{onConflict:'user_id'}).select().single();}
async function nextStep(){if(busy)return;collect();busy=true;$('fgOnboardingNext').disabled=true;$('fgOnboardingStatus').textContent='Saving your progress…';const last=step===STEPS.length-1;const r=await persist(last);busy=false;$('fgOnboardingNext').disabled=false;if(r.error){$('fgOnboardingStatus').textContent='Could not save yet. Please try again.';console.error('[Teacher onboarding]',r.error);return;}if(last){$('fgTeacherOnboarding').hidden=true;document.body.style.overflow='';renderProfile();if(window.portalLog)window.portalLog('teacher_onboarding_completed',{program_stage:answers.program_stage||'unspecified'});return;}step++;renderStep();}
async function saveAndClose(){if(busy)return;collect();busy=true;$('fgOnboardingStatus').textContent='Saving…';const r=await persist(false);busy=false;if(r.error){$('fgOnboardingStatus').textContent='Could not save. Please try again.';console.error('[Teacher onboarding]',r.error);return;}$('fgTeacherOnboarding').hidden=true;document.body.style.overflow='';renderProfile();}
function openWizard(){if(!ready)return;ensureUi();step=0;renderStep();$('fgTeacherOnboarding').hidden=false;document.body.style.overflow='hidden';}
function renderProfile(){
 const home=$('sec-home');if(!home)return;let card=$('fgTeacherProfileCard');
 if(!card){card=document.createElement('div');card.id='fgTeacherProfileCard';card.className='card fg-profile-card';const k=home.querySelector('.kpi-row');if(k)k.insertAdjacentElement('afterend',card);else home.prepend(card);}
 const location=[answers.city,answers.state_code].filter(Boolean).join(', '),summary=[location,answers.school_type,answers.program_stage].filter(Boolean).join(' · ');
 const todo=[
 ['admin_buy_in',['No','In progress','Not sure who to ask'],'Get administrative approval','/setupguide.html'],
 ['funding_status',['No funding yet','Need help identifying funding','Partially funded','Not sure'],'Identify funding and sponsor options','/teachers-professionals.html'],
 ['judge_status',['No judges yet','Need help finding them','A few judges'],'Build your judging panel','/volunteer.html'],
 ['venue_status',['No','Need help finding a venue'],'Confirm an event location','/setupguide.html'],
 ['student_interest',['Not yet','Need help recruiting','Some interest / informal conversations'],'Build student interest','/researchguide.html']
 ];
 const priorities=todo.filter(x=>x[1].includes(answers[x[0]])).slice(0,4);
 card.innerHTML='<div class="card-header"><h3>Your School Profile</h3><button class="btn-xs" type="button" id="fgEditTeacherProfile">Edit answers →</button></div><div class="card-body"><div><div class="fw-500" style="color:var(--g900);margin-bottom:3px">'+esc(answers.school_name||'Your school profile')+'</div><div class="fg-profile-summary">'+esc(summary||'Add your school details to personalize your portal.')+'</div><div class="fg-profile-summary">'+(answers.student_count?esc(answers.student_count)+' students anticipated · ':'')+(answers.fair_format?esc(answers.fair_format)+' format':'')+'</div></div><div><div class="fw-600" style="font-size:.8rem;color:var(--g900)">Suggested next priorities</div><div class="fg-priority-list">'+(priorities.length?priorities.map(x=>'<div class="fg-priority-item"><span>'+esc(x[2])+'</span><a href="'+x[3]+'">Open resource →</a></div>').join(''):'<div class="fg-priority-item">Your profile is saved. Keep it updated as your plans develop.</div>')+'</div></div></div>';
 $('fgEditTeacherProfile').onclick=openWizard;
}
async function init(user){if(ready||!user||!user.id)return;ready=true;userId=user.id;ensureUi();const r=await sb.from('teacher_onboarding_profiles').select('answers,completed_at').eq('user_id',userId).maybeSingle();if(r.error){console.warn('[Teacher onboarding] Profile load failed:',r.error.message);return;}answers=r.data&&r.data.answers&&typeof r.data.answers==='object'?r.data.answers:{};renderProfile();if(!r.data||!r.data.completed_at)openWizard();}
window.openTeacherOnboarding=openWizard;
window.addEventListener('fg:teacher-ready',e=>init(e.detail&&e.detail.user));
if(window.fgTeacherReadyUser)init(window.fgTeacherReadyUser);
})();