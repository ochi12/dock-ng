# Dock Next Generation (DOCK!NG)
A lightweight non-fixed dock support for GNOME Shell using the native dash with simple but adaptive intellihide. 

# Preview
<img width="1920" height="1080" alt="Screenshot From 2025-10-16 20-34-30" src="https://github.com/user-attachments/assets/1e72f783-ec32-4026-bf79-42efc8ad48c8" />

# Installation
You can install dock-ng through this link https://extensions.gnome.org/extension/8682/dockng/
<br>
<br>
If you are a contributor or just prefers installing with the latest changes:
<br>
<br>
**Clone this repository**
```bash
$ git clone https://github.com/ochi12/dock-ng#
```
**Run build and install at once** - assuming you have `Make` installed in your system
```bash
$ make all
```
# Contributors
## Version Control
we follow this convention: 
v*GNOME-VERSION-INCREMENT*.*NEW-FEATURES-INCREMENT*.*MINOR-CHANGES-INCREMENT*-gnome*MINIMUM-GNOME-VERSION* -> `e.g. v5.1.50-gnome52`
<br>
<br>
- **GNOME-VERSION-INCREMENT** - In the next gnome version major release we increment this by 1.
  
- **NEW-FEATURES-INCREMENT** - Depending on demand, 1 or more feature release or removal might increment this by 1.
  
- **MINOR-CHANGES-INCREMENT** - Any Bug fixes or feature improvement we increment this by  1. (if feature improvement is major we increment NEW-FEATURES-INCREMENT instead).

- **MINIMUM-GNOME-VERSION** - Currently this is not part of the version control but if future release like gnome 52 for example gives us breaking changes then we set this to that version.
We will then push the previous version to a new branch with the last version numbers + the minimum gnome version it last supported. `note that this is only added for branch names excluding master`

```
e.g:
master
5.1.0-gnome51
2.0.23-gnome-50
1.24.25-gnome-45
```
for example if a user has gnome 48 then he can clone and install 1.24.25-gnome45 since 48 is less than 2.0.23-gnome-50
