import {handleAuthCallback,acceptInvite,login,logout,getUser} from '@netlify/identity';
const $=id=>document.getElementById(id);let invitation=null;
function status(s){$('auth-status').textContent=s}
async function init(){
 try{
  const result=await handleAuthCallback();
  if(result?.type==='invite'&&result.token){invitation=result.token;$('invite-panel').hidden=false;status('Invitation received. Choose a password to activate your account.');return}
  if(result)status('Account confirmation processed.');
  const user=await getUser();
  if(user){$('login-panel').hidden=true;$('logout').hidden=false;status('Signed in as '+user.email);window.dispatchEvent(new Event('tank-auth-ready'))}
  else status('Please sign in to access your private room.');
 }catch(e){status('Account setup error: '+e.message)}
}
$('accept-invite').onclick=async()=>{const password=$('invite-password').value;if(password.length<12){status('Choose a password of at least 12 characters.');return}try{await acceptInvite(invitation,password);invitation=null;$('invite-password').value='';$('invite-panel').hidden=true;status('Account activated. Please sign in below.');$('login-panel').hidden=false}catch(e){status('Invitation could not be accepted: '+e.message)}};
$('login').onclick=async()=>{try{await login($('login-email').value,$('login-password').value);$('login-password').value='';await init()}catch(e){status('Login failed: '+e.message)}};
$('logout').onclick=async()=>{await logout();location.reload()};
init();
