using UnityEngine;
using System.Net.Sockets;
using System.Text;

public class UdpTransport : MonoBehaviour
{
    public string targetIP = "127.0.0.1";
    public int targetPort = 4210;

    private UdpClient udpClient;

    void Start()
    {
        udpClient = new UdpClient();
        Debug.Log($"UDP Transport ready -> {targetIP}:{targetPort}");
    }

    public void Send(string message)
    {
        if (udpClient == null)
            return;

        byte[] data = Encoding.UTF8.GetBytes(message);

        udpClient.Send(
            data,
            data.Length,
            targetIP,
            targetPort
        );
    }

    void OnDestroy()
    {
        udpClient?.Close();
    }
}