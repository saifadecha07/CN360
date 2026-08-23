using UnityEngine;
using System.Net.Sockets;
using System.Text;
using System.Globalization;

public class UdpHeadSender : MonoBehaviour
{
    public Transform head;

    public string targetIP = "127.0.0.1";
    public int targetPort = 4210;

    public float sendRate = 20f;

    private UdpClient udpClient;
    private float sendTimer;

    void Start()
    {
        udpClient = new UdpClient();

        Debug.Log(
            $"UDP Sender started -> {targetIP}:{targetPort}"
        );
    }

    void Update()
    {
        if (head == null)
            return;

        sendTimer += Time.deltaTime;

        if (sendTimer >= 1f / sendRate)
        {
            sendTimer = 0f;
            SendHeadData();
        }
    }

    void SendHeadData()
    {
        Vector3 rotation = head.localEulerAngles;

        float pitch = NormalizeAngle(rotation.x);
        float yaw = NormalizeAngle(rotation.y);

        string message = string.Format(
            CultureInfo.InvariantCulture,
            "HEAD,{0:F1},{1:F1}",
            yaw,
            pitch
        );

        byte[] data = Encoding.UTF8.GetBytes(message);

        udpClient.Send(
            data,
            data.Length,
            targetIP,
            targetPort
        );
    }

    float NormalizeAngle(float angle)
    {
        if (angle > 180f)
            angle -= 360f;

        return angle;
    }

    void OnDestroy()
    {
        udpClient?.Close();
    }
}