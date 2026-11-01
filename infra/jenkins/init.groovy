// Инициализация Jenkins при первом старте контейнера (mounted в init.groovy.d).
// Делает две вещи: отключает setup-wizard и заводит администратора из переменных окружения,
// чтобы job можно было создать скриптом, а не кликами в браузере.
import jenkins.install.InstallState
import jenkins.model.Jenkins
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm

def env = System.getenv()
def adminUser = env['JENKINS_ADMIN_USER'] ?: 'admin'
def adminPassword = env['JENKINS_ADMIN_PASSWORD']

if (adminPassword) {
    def realm = new HudsonPrivateSecurityRealm(false)
    def existing = realm.getUser(adminUser)
    if (existing == null) {
        realm.createAccount(adminUser, adminPassword)
        println "jenkins-init: создан пользователь ${adminUser} из JENKINS_ADMIN_PASSWORD"
    } else {
        // Volume переживает пересборку контейнера, поэтому пароль нужно обновлять, а не
        // оставлять тот, что записался при первом старте (или генерировал setup-wizard).
        realm.saveUser(existing, adminPassword)
        println "jenkins-init: пароль пользователя ${adminUser} обновлён из JENKINS_ADMIN_PASSWORD"
    }
    Jenkins.instance.setSecurityRealm(realm)

    def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
    // Анонимный доступ к конфигурации и артефактам закрываем: стек поднимается на машине,
    // где порты опубликованы на loopback, но лишних читателей сборки быть не должно.
    strategy.setAllowAnonymousRead(false)
    Jenkins.instance.setAuthorizationStrategy(strategy)
} else {
    println 'jenkins-init: JENKINS_ADMIN_PASSWORD не задан — Jenkins остаётся на ' +
            'первоначальном пароле из /run/secrets/jenkins (браузерный setup-wizard)'
}

Jenkins.instance.setInstallState(InstallState.INITIAL_SETUP_COMPLETED)
Jenkins.instance.save()
