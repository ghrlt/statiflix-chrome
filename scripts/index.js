async function writeLogMessage(message, append = false, onlyConsole = false) {
    console.log(message);

    if (!onlyConsole) {
        // ~ Send message to HTML
        const logField = document.getElementById('logs');
        if (logField) {
            if (append) {
                logField.innerHTML += message + '<br>';
            } else {
                logField.innerHTML = message + '<br>';
            }
        }
    }
}

async function hideLoader() {
    writeLogMessage('Hiding loader...');

    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
    }

    const content = document.getElementById('content');
    if (content) {
        content.style.display = '';
    }

    writeLogMessage('Loader hidden');
}

async function showLoader() {
    writeLogMessage('Showing loader...');

    const content = document.getElementById('content');
    if (content) {
        content.style.display = 'none';
    }

    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = '';
    }

    writeLogMessage('Loader shown');
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


async function fetchProfiles() {
    writeLogMessage('Fetching Netflix profiles...');

    var profilesData = [];

    try {
        const resp = await fetch('https://www.netflix.com/browse');
        if (resp.status !== 200) {
            writeLogMessage('Unable to fetch Netflix profiles. Code ' + resp.status);
            throw new Error('Code ' + resp.status + ' while fetching Netflix profiles.');
        }

        const data = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');

        const profilesList = doc.querySelector('.choose-profile');
        if (profilesList) {
            writeLogMessage('Found profiles list in the page');
            const profiles = profilesList.querySelectorAll('.profile');
            if (profiles.length > 0) {
                profiles.forEach((profile) => {
                    let profileName = profile.querySelector('.profile-name').textContent;
                    let profileUid = profile.querySelector('.profile-icon').getAttribute('data-profile-guid');
                    let profileAvatar = profile.querySelector('.profile-icon').getAttribute('style');
                    if (profileAvatar) {
                        profileAvatar = profileAvatar.split('url(')[1].split(')')[0];
                    }
                    profilesData.push({
                        name: he.decode(profileName),
                        uid: profileUid,
                        avatar: profileAvatar,
                    });
                });
                writeLogMessage('Profiles found in the list: ' + profilesData.length);

            } else {
                writeLogMessage('No profiles found in the list');
            }
        } else {
            // ~ Case where /browse page does not contain the profiles list, but the data is in a script tag
            writeLogMessage('Profiles list not found in the page, looking for falcorCache data...');

            const scripts = doc.querySelectorAll('script');
            for (let script of scripts) {
                const scriptContent = script.textContent;

                if (scriptContent.includes('netflix.falcorCache')) {
                    const match = scriptContent.match(/netflix\.falcorCache\s*=\s*(\{.*?\});/s);
                    if (match && match[1]) {
                        writeLogMessage('Found falcorCache data in the script tag');

                        let jsonString = match[1].replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();
                        jsonString = jsonString.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => {
                            return String.fromCharCode(parseInt(hex, 16));
                        });

                        const falcorCache = JSON.parse(jsonString);

                        for (let profileGuid in falcorCache.profiles) {
                            let profile = falcorCache.profiles[profileGuid];
                            profilesData.push({
                                name: he.decode(profile.summary.value.profileName),
                                uid: profileGuid,
                                avatar: falcorCache.avatars.nf[profileGuid].images.byWidth[320].value,
                            });
                        }
                        writeLogMessage('Profiles found in falcorCache: ' + profilesData.length);
                    } else {
                        writeLogMessage('Could not find falcorCache data');
                    }
                    // ~ Stop after finding the falcorCache data
                    break;
                }
            }
        }
        writeLogMessage('Netflix profiles fetched: ' + profilesData.length);
    } catch (error) {
        writeLogMessage('Error fetching profiles: ' + error);
    }

    return profilesData;
}

async function displayProfiles(profiles) {
    writeLogMessage('Displaying Netflix profiles...');

    const profilesList = document.getElementById('profiles-list');
    if (profilesList) {
        profilesList.innerHTML = '';

        profiles.forEach((profile) => {
            const profileItem = document.createElement('div');
            profileItem.classList.add('profile');
            profileItem.classList.add('perspec');

            profileItem.setAttribute('data-profile-uid', profile.uid);

            const profileAvatar = document.createElement('div');
            profileAvatar.classList.add('avatar');
            const profileAvatarImg = document.createElement('img');
            profileAvatarImg.src = profile.avatar;
            profileAvatarImg.alt = profile.name;
            profileAvatar.appendChild(profileAvatarImg);
            profileItem.appendChild(profileAvatar);

            const profileName = document.createElement('h2');
            profileName.classList.add('name');
            profileName.textContent = profile.name;
            profileItem.appendChild(profileName);

            profileItem.addEventListener('click', async () => {
                if (profileItem.classList.contains('current')) {
                    return;
                }

                writeLogMessage('Selectionned profile: ' + profile.name);
                profileItem.classList.add('current');
                handleProfileSelection(profile);
            });

            profilesList.appendChild(profileItem);
        });
    } else {
        writeLogMessage('No profiles list element found in the page');
    }

    writeLogMessage('Netflix profiles displayed');
}


async function getCookies(domain) {
    return new Promise((resolve, reject) => {
        chrome.cookies.getAll({ domain }, (cookies) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(cookies);
        });
    });
}

async function switchProfileAndGetCookies(profilUid) {
    writeLogMessage('Switching to Netflix profile ' + profilUid);

    const timestamp = Date.now();
    const resp = await fetch(
        `https://www.netflix.com/api/shakti/mre/profiles/switch?switchProfileGuid=${profilUid}&_=${timestamp}&authURL=/`
    );
    if (resp.status !== 200) {
        writeLogMessage('Could not switch to Netflix profile. Code ' + resp.status);
        throw new Error('Code ' + resp.status + ' while switching to Netflix profile.');
    }

    var netflixCookies = [];
    var cookies = await getCookies("netflix.com");
    for (let cookie of cookies) {
        netflixCookies.push({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain
        });
    }
    writeLogMessage(`Found ${netflixCookies.length} cookies for profile ${profilUid}`);
    return netflixCookies;
}

async function handleProfileSelection(profile) {
    writeLogMessage('Handling profile selection...');

    // ~ Get cookies for profile
    cookies = await switchProfileAndGetCookies(profile.uid);

    // ~ Create JSON object with cookies and profileUid
    var obj = {
        profileUid: profile.uid,
        cookies: cookies
    };

    // ~ Encode data to Base64
    var dataString = JSON.stringify(data);
    var dataBase64 = btoa(dataString);

    // ~ Generate data
    var data = {
        'action': 'add-new-profile',
        'profile_username': profile.name,
        'profile_obj': dataBase64
    }

    // ~ Encode data to Base64
    var dataString = JSON.stringify(data);
    var dataBase64 = btoa(dataString);

    // ~ Create QR Code
    var qrCodeElement = document.getElementById('qr-code');
    qrCodeElement.innerHTML = '';
    var qrCode = new QRCode(qrCodeElement, {
        text: dataBase64,
        imagePath: 'medias/icon.png',
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    qrCodeElement.alt = 'StatiFlix generated QR Code';

    // ~ Use setTimeout to give qrCode its time to be generated
    setTimeout(() => {
        var avatarElement = document.querySelector('div[data-profile-uid="' + profile.uid + '"]').querySelector('.avatar');
        var qrImg = qrCodeElement.querySelector('img');

        if (qrImg) {
            // ~ Add rotate animation to avatar
            avatarElement.classList.add('rotate-qr');

            // ~ Use setTimeout to change img src after animation
            setTimeout(() => {
                const avatarUrl = avatarElement.querySelector('img').getAttribute('src');
                avatarElement.querySelector('img').src = qrImg.getAttribute('src');
                avatarElement.querySelector('img').alt = 'StatiFlix generated QR Code';
                avatarElement.querySelector('img').style.border = '1px solid #fff';

                setTimeout(() => {
                    avatarElement.classList.remove('rotate-qr');
                }, 1000 * .25); // ~  25% of CSS animation duration

                // ~ Hide QR Code after 5 seconds
                setTimeout(() => {
                    avatarElement.classList.add('rotate-qr');

                    setTimeout(() => {
                        avatarElement.querySelector('img').src = avatarUrl;
                        avatarElement.querySelector('img').alt = profile.name;
                        avatarElement.querySelector('img').style.border = 'none';

                        profileItem.classList.remove('current');

                        setTimeout(() => {
                            avatarElement.classList.remove('rotate-qr');
                        }, 1000 * .25); // ~  25% of CSS animation duration
                    }, 1000 * .75); // ~  75% of CSS animation duration
                }, 5000);
            }, 1000 * .75); // ~  75% of CSS animation duration
        } else {
            console.error('L\'image du QR Code n\'a pas été générée.');
        }
    }, 100); // Temps d'attente pour laisser le temps au QR code d'être généré

    writeLogMessage('Profile selection handled');
}

async function main() {
    await showLoader();

    await sleep(300);

    const profiles = await fetchProfiles();
    console.log(profiles);

    await sleep(300);

    await hideLoader();
    await displayProfiles(profiles);
}
main();